# Product Requirements Document (PRD)

## Admin Time Entry Edit Functionality & Timer Session Email Notifications

### Executive Summary

This PRD outlines the implementation of two critical admin features to enhance the timesheet management system:

1. **Admin Time Entry Edit Functionality**: Enable admins to edit any user's time entries to correct mistakes and maintain data accuracy.
2. **Timer Session Email Notifications**: Implement automated email notifications to users with active timer sessions at a configurable time to remind them to end their sessions.

### Current State Analysis

Based on the codebase exploration, the current system has:

- **Time Entry Management**: Users can only edit their own time entries for the current day
- **Admin Capabilities**: Admins can view all users' time entries but cannot edit them
- **Timer Sessions**: Multiple active timer sessions per user with real-time tracking
- **Email Infrastructure**: Basic email functionality exists via `nodemailer`
- **Database Schema**: Well-structured with proper relationships between users, projects, time entries, and timer sessions

### Feature 1: Admin Time Entry Edit Functionality

#### Problem Statement
Currently, if users make mistakes in their time entries, admins have no way to correct them, leading to inaccurate reporting and potential compliance issues.

#### Solution Overview
Extend the existing time entry edit functionality to allow admins to edit any user's time entries regardless of date restrictions.

#### Technical Requirements

**Backend Changes:**

1. **API Endpoint Modification** (`apps/server/src/time-entries/index.ts`):
   - Modify the `PUT /id/:id` endpoint to allow admin override
   - Remove date restrictions for admin users
   - Maintain existing validation for non-admin users

2. **Authorization Logic**:
   ```typescript
   // Current logic (line 420-425 in time-entries/index.ts):
   if (existingEntry.userId !== user.userId) {
     return status(403, "Forbidden: You cannot update this time entry")
   }
   
   // New logic:
   if (existingEntry.userId !== user.userId && user.role !== "admin") {
     return status(403, "Forbidden: You cannot update this time entry")
   }
   ```

3. **Date Validation Override**:
   ```typescript
   // Current logic (line 430-440):
   const today = getUserTimezoneToday(userTimezone)
   if (!dayjs(existingEntryDate.date).isSame(today, "day")) {
     return status(400, "You can only edit time entries created today")
   }
   
   // New logic:
   if (user.role !== "admin") {
     const today = getUserTimezoneToday(userTimezone)
     if (!dayjs(existingEntryDate.date).isSame(today, "day")) {
       return status(400, "You can only edit time entries created today")
     }
   }
   ```

**Frontend Changes:**

1. **Admin User Detail Page** (`apps/dashboard/app/pages/admin/users/[userId]/index.vue`):
   - Add edit buttons to time entry rows
   - Integrate with existing `TimeEntryModal` component
   - Pass admin context to modal

2. **TimeEntryModal Component** (`apps/dashboard/app/components/TimeEntryModal.vue`):
   - Add `isAdmin` prop to bypass date restrictions
   - Modify validation logic for admin users
   - Update UI to indicate admin editing mode

3. **Admin Project Detail Page** (`apps/dashboard/app/pages/admin/projects/[projectId]/index.vue`):
   - Add edit functionality for time entries in project context
   - Similar integration as user detail page

#### User Experience Flow

1. **Admin navigates to user detail page** (`/admin/users/[userId]`)
2. **Admin clicks "Edit" button** on any time entry
3. **Modal opens with admin privileges** (no date restrictions)
4. **Admin makes changes** and saves
5. **System validates changes** and updates the entry
6. **Success notification** shown to admin

#### Data Validation Rules

- **Admin Users**: Can edit any time entry regardless of date
- **Regular Users**: Maintain existing restrictions (current day only)
- **Field Validation**: All existing validation rules apply
- **Audit Trail**: Track admin edits in `updatedAt` timestamp

### Feature 2: Timer Session Email Notifications

#### Problem Statement
Users often forget to end their timer sessions at the end of the work day, leading to inaccurate time tracking and potential overtime issues.

#### Solution Overview
Implement a configurable email notification system that sends reminders to users with active timer sessions at a specified time.

#### Technical Requirements

**Database Schema Changes:**

1. **Add System Settings Table** (`apps/server/src/db/schema.ts`):
   ```typescript
   export const systemSettings = pgTable("system_settings", {
     id: uuid("id").defaultRandom().primaryKey(),
     key: text("key").unique().notNull(),
     value: text("value").notNull(),
     description: text("description"),
     createdAt: timestamp("created_at").defaultNow().notNull(),
     updatedAt: timestamp("updated_at")
       .defaultNow()
       .notNull()
       .$onUpdate(() => new Date()),
   })
   ```

2. **Add Email Notification Tracking**:
   ```typescript
   export const emailNotifications = pgTable("email_notifications", {
     id: uuid("id").defaultRandom().primaryKey(),
     userId: uuid("user_id")
       .notNull()
       .references((): AnyPgColumn => users.id, { onDelete: "cascade" }),
     type: text("type").notNull(), // 'timer_reminder'
     sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
     date: date("date").notNull(), // Track which day the notification was sent
     createdAt: timestamp("created_at").defaultNow().notNull(),
   })
   ```

**Backend Implementation:**

1. **Admin Settings API** (`apps/server/src/admin/settings.ts`):
   ```typescript
   export const adminSettingsRoutes = baseApp("adminSettings").group(
     "/admin/settings",
     (app) =>
       app
         .use(authGuard("admin"))
         .get("/", async ({ db }) => {
           // Get current timer reminder settings
         })
         .patch("/", async ({ db, body }) => {
           // Update timer reminder settings
         })
   )
   ```

2. **Email Notification Service** (`apps/server/src/services/timerNotificationService.ts`):
   ```typescript
   export const sendTimerReminderEmails = async (db: Database) => {
     // 1. Get system settings for reminder time
     // 2. Check if notifications were already sent today
     // 3. Find users with active timer sessions
     // 4. Send emails and track notifications
   }
   ```

3. **Cron Job Integration** (`apps/server/src/services/recurringBudgetCron.ts`):
   - Add timer notification cron job
   - Run at configurable time (e.g., 6:00 PM daily)

**Frontend Implementation:**

1. **Admin Settings Page** (`apps/dashboard/app/pages/admin/settings/index.vue`):
   - Add timer notification configuration section
   - Time picker for reminder time
   - Enable/disable toggle
   - Test notification button

2. **Settings UI Components**:
   ```vue
   <UFormField label="Timer Reminder Time" name="timerReminderTime">
     <UInput
       v-model="timerReminderTime"
       type="time"
       placeholder="18:00"
     />
   </UFormField>
   
   <UFormField label="Enable Timer Reminders" name="enableTimerReminders">
     <UToggle v-model="enableTimerReminders" />
   </UFormField>
   ```

#### Email Template

**Subject**: "Timer Session Reminder - Please End Your Active Sessions"

**Body**:
```
Hi [User Name],

You have active timer sessions running. Please remember to end your sessions at the end of your work day to ensure accurate time tracking.

Active Sessions:
[Session 1] - Started at [time] - Duration: [duration]
[Session 2] - Started at [time] - Duration: [duration]

To end your sessions, please visit the dashboard and click "End Session" for each active timer.

Best regards,
[Company Name] Timesheet System
```

#### User Experience Flow

1. **Admin configures reminder time** in settings page
2. **System runs daily cron job** at specified time
3. **System checks for active sessions** and sends emails
4. **Users receive email reminders** with session details
5. **System tracks sent notifications** to prevent duplicates

#### Configuration Options

- **Reminder Time**: Configurable time (default: 6:00 PM)
- **Enable/Disable**: Toggle for entire feature
- **Timezone**: Use system timezone or user timezone
- **Frequency**: Daily (configurable for different schedules)

### Implementation Priority

**Phase 1: Admin Time Entry Edit (High Priority)**
- Backend API modifications
- Frontend integration in admin pages
- Testing and validation

**Phase 2: Timer Email Notifications (Medium Priority)**
- Database schema updates
- Email service implementation
- Admin settings UI
- Cron job setup

### Success Metrics

**Admin Time Entry Edit:**
- 100% of admin edit requests succeed
- Zero impact on existing user edit functionality
- Audit trail maintained for all admin edits

**Timer Email Notifications:**
- 90% reduction in overnight timer sessions
- 95% email delivery success rate
- Configurable reminder time working correctly

### Risk Assessment

**Low Risk:**
- Admin edit functionality builds on existing patterns
- Email infrastructure already exists

**Medium Risk:**
- Date validation changes could affect existing functionality
- Email notifications require careful timezone handling

**Mitigation:**
- Comprehensive testing of admin override logic
- Timezone-aware email scheduling
- Gradual rollout with monitoring

### Testing Strategy

1. **Unit Tests**: API endpoint modifications
2. **Integration Tests**: Admin edit flow end-to-end
3. **Email Tests**: Notification delivery and content
4. **Timezone Tests**: Cross-timezone functionality
5. **User Acceptance**: Admin workflow validation

### Development Checklist

#### Feature 1: Admin Time Entry Edit ✅ COMPLETED

**Backend Tasks:**
- [x] Modify `PUT /id/:id` endpoint in `time-entries/index.ts`
- [x] Add admin role check in authorization logic
- [x] Override date validation for admin users
- [x] Test admin edit functionality
- [x] Ensure existing user functionality unchanged

**Frontend Tasks:**
- [x] Add `isAdmin` prop to `TimeEntryModal.vue`
- [x] Update validation logic for admin context
- [x] Add edit buttons to admin project detail page (`[projectId].vue`)
- [x] Add delete functionality for time entries
- [x] Update UI to indicate admin editing mode
- [x] Test admin edit flow end-to-end
- [x] Fix project selection and time format display
- [x] Add proper error handling and success notifications

#### Feature 2: Timer Email Notifications

**Database Tasks:**
- [ ] Add `systemSettings` table to schema
- [ ] Add `emailNotifications` table to schema
- [ ] Run database migrations
- [ ] Seed default system settings

**Backend Tasks:**
- [ ] Create admin settings API endpoints
- [ ] Implement timer notification service
- [ ] Add cron job for daily notifications
- [ ] Create email template for timer reminders
- [ ] Test email delivery functionality

**Frontend Tasks:**
- [ ] Add timer notification settings to admin settings page
- [ ] Create time picker component for reminder time
- [ ] Add enable/disable toggle for notifications
- [ ] Add test notification button
- [ ] Test settings configuration

**Integration Tasks:**
- [ ] Test end-to-end notification flow
- [ ] Verify timezone handling
- [ ] Test duplicate notification prevention
- [ ] Monitor email delivery success rates

### Notes

- This PRD should be updated as development progresses
- All changes should maintain backward compatibility
- Testing should be comprehensive before deployment
- Monitor system performance after implementation 