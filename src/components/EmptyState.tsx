/**
 * @file 空状态占位组件
 * @description 通用空状态占位组件，用于无数据时展示
 */
import { cn } from '@/lib/utils'

// Empty component
export default function Empty() {
  return (
    <div className={cn('flex h-full items-center justify-center')}>Empty</div>
  )
}
