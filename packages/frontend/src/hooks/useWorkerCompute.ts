import { useState, useEffect, useRef } from 'react';
export type WorkerTask = { type: string; payload: unknown[] };
export function useChartCalcWorker<T>(task: WorkerTask | null): { data: T | null; isPending: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const idRef = useRef(0);
  const lastTaskKeyRef = useRef('');
  useEffect(() => {
    const w = new Worker(new URL('../workers/chartCalc.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = w;
    let terminated = false;
    w.onmessage = (e: MessageEvent<{ id: number; result: T; error?: string }>) => {
      if (terminated) return;
      setIsPending(false);
      if (e.data.error) {
        setError(e.data.error);
      } else {
        setData(e.data.result);
        setError(null);
      }
    };
    return () => {
      terminated = true;
      w.terminate();
      workerRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!task || !workerRef.current) return;
    const key = task.type + ':' + JSON.stringify(task.payload);
    if (key === lastTaskKeyRef.current) return;
    lastTaskKeyRef.current = key;
    const id = idRef.current++;
    setIsPending(true);
    workerRef.current.postMessage({ id, type: task.type, payload: task.payload });
  }, [task]);
  return { data, isPending, error };
}
