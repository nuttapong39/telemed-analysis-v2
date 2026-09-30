import { useState, useCallback, useEffect, useRef } from 'react'
import type { QueryState } from '@/types'

interface UseQueryOptions<T> {
  queryFn: () => Promise<T>
  enabled?: boolean
  onSuccess?: (data: T) => void
  onError?: (error: Error) => void
}

interface UseQueryResult<T> {
  data: T | null
  error: Error | null
  state: QueryState
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
  executionTimeMs: number | null
  execute: () => Promise<void>
  reset: () => void
}

export function useQuery<T>(options: UseQueryOptions<T>): UseQueryResult<T> {
  const { queryFn, enabled = false, onSuccess, onError } = options
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [state, setState] = useState<QueryState>('idle')
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null)
  const mountedRef = useRef(true)
  const queryFnRef = useRef(queryFn)
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)

  // Keep refs up to date with the latest callbacks
  useEffect(() => {
    queryFnRef.current = queryFn
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
  }, [queryFn, onSuccess, onError])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const execute = useCallback(async () => {
    setState('loading')
    setError(null)
    const startTime = Date.now()
    try {
      const result = await queryFnRef.current()
      if (!mountedRef.current) return
      setExecutionTimeMs(Date.now() - startTime)
      setData(result)
      setState('success')
      onSuccessRef.current?.(result)
    } catch (err) {
      if (!mountedRef.current) return
      setExecutionTimeMs(Date.now() - startTime)
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setState('error')
      onErrorRef.current?.(error)
    }
  }, [])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setState('idle')
    setExecutionTimeMs(null)
  }, [])

  useEffect(() => {
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      execute()
    }
  }, [enabled, execute])

  return {
    data,
    error,
    state,
    isLoading: state === 'loading',
    isError: state === 'error',
    isSuccess: state === 'success',
    executionTimeMs,
    execute,
    reset,
  }
}
