/*
Notification hook manages a notification state for the application. 

Separating notifications from their presentation allows for more flexibility in the future.
*/
import { useCallback, useRef, useState } from 'react'

export type Notification = {
  id: number
  message: string
}

export default function useNotifications() {
  const [messages, setMessages] = useState<Notification[]>([])
  const nextId = useRef(0)

  /* 
  useCallback required since functions are used as dependencies for other components.
  */
  const handleAddMessage = useCallback((message: string) => {
    const id = nextId.current
    nextId.current += 1
    setMessages((prev) => [...prev, { id, message }])
  }, [])

  const handleDismissMessage = useCallback((id: number) => {
    setMessages((prev) => prev.filter((item) => item.id !== id))
  }, [])

  return {
    messages,
    onAddMessage: handleAddMessage,
    onDismissMessage: handleDismissMessage,
  }
}
