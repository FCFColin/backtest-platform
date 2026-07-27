/**
 * @file AddPortfolioMenu 组件
 * @description 添加组合下拉菜单：空白/预设/已保存/滑行路径/加载示例。
 */
import { Plus, ChevronDown, BookOpen, History, TrendingUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu.js';

interface AddPortfolioMenuProps {
  onAdd: (type: 'empty' | 'preset' | 'saved' | 'glidepath' | 'example') => void;
}

/**
 * 添加组合下拉菜单。
 * @param props - onAdd 回调，传入组合类型。
 * @returns 下拉菜单按钮元素。
 */
export function AddPortfolioMenu({ onAdd }: AddPortfolioMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Plus className="h-4 w-4 mr-1" />
          添加组合
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onAdd('empty')}>
          <Plus className="h-4 w-4 mr-2" /> 空白组合
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd('preset')}>
          <BookOpen className="h-4 w-4 mr-2" /> 从预设开始
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd('saved')}>
          <History className="h-4 w-4 mr-2" /> 从已保存导入
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAdd('glidepath')}>
          <TrendingUp className="h-4 w-4 mr-2" /> 滑行路径组合
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAdd('example')}>
          <Sparkles className="h-4 w-4 mr-2" /> 加载示例
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
