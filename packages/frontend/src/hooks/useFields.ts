import { useReducer, useRef, useMemo } from 'react';

type FieldsAction<T> = { key: keyof T; value: T[keyof T] };

function fieldsReducer<T>(state: T, action: FieldsAction<T>): T {
  return { ...state, [action.key]: action.value };
}

export function useFields<T extends Record<string, unknown>>(
  initialValues: T,
): T & Record<string, (value: T[keyof T]) => void> {
  const [state, dispatch] = useReducer(fieldsReducer<T>, initialValues);

  const keysRef = useRef(Object.keys(initialValues));

  const setters = useMemo(() => {
    const result: Record<string, (value: T[keyof T]) => void> = {};
    for (const key of keysRef.current) {
      const setterName = `set${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      result[setterName] = (value: T[keyof T]) => dispatch({ key: key as keyof T, value });
    }
    return result;
  }, []);

  return { ...state, ...setters } as ReturnType<typeof useFields<T>>;
}
