import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  DateField,
  SelectField,
} from '../../../packages/frontend/src/components/form/sharedFields.js';
import { AffixInput } from '../../../packages/frontend/src/components/ui/uiComponents.js';

vi.mock('react-i18next', async () => (await import('../../helpers/i18nMock.js')).i18nMock);

describe('DateField', () => {
  it('渲染标签并透传日期值', () => {
    render(<DateField id="start" label="START DATE" value="2024-01-15" onChange={() => {}} />);
    screen.getByText('START DATE');
    expect(screen.getByDisplayValue('2024-01-15').getAttribute('type')).toBe('date');
  });

  it('disabled 状态正确传递', () => {
    render(<DateField id="start" label="START DATE" value="" onChange={() => {}} disabled />);
    expect((screen.getByLabelText('START DATE') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('SelectField', () => {
  it('渲染标签与当前选中值', () => {
    render(
      <SelectField
        id="currency"
        label="CURRENCY"
        value="usd"
        onChange={() => {}}
        options={[
          { value: 'usd', label: 'USD ($)' },
          { value: 'cny', label: 'CNY (¥)' },
        ]}
      />,
    );
    screen.getByText('CURRENCY');
    screen.getByText('USD ($)');
  });
});

describe('AffixInput', () => {
  it('渲染前缀与后缀', () => {
    render(<AffixInput prefix="$" suffix="months" />);
    screen.getByText('$');
    screen.getByText('months');
  });

  it('输入值正确传递', () => {
    render(<AffixInput value="100" onChange={() => {}} />);
    screen.getByDisplayValue('100');
  });
});
