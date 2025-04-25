import type { DropdownMenuItem } from "#ui/types"

export const useDropdownMonths = () => {
  const dayjs = useDayjs()
  const selectedMonth = shallowRef(dayjs().startOf("month").toDate())

  const monthOptions = computed(() => {
    const options: DropdownMenuItem[] = Array.from({ length: 12 }, (_, i) => {
      const date = dayjs().startOf("year").add(i, "month")
      return {
        label: date.format("MMMM"),
        checked: date.isSame(selectedMonth.value, "month"),
        type: "checkbox",
        onSelect: () => {
          selectedMonth.value = date.toDate()
        },
      }
    })
    return options
  })

  return { monthOptions, selectedMonth }
}
