import './styles.css'
import type { Notification } from '../../hooks/useNotifications'

interface ToastProps {
  messages: Notification[]
  onDismiss: (id: number) => void
}

function Toast({ messages, onDismiss }: ToastProps) {
  if (messages.length === 0) return null

  return (
    <div className="toast">
      {messages.map((item) => (
        <ToastItem
          key={item.id}
          message={item.message}
          onDismiss={() => onDismiss(item.id)}
        />
      ))}
    </div>
  )
}

function ToastItem({ message, onDismiss }: { message: string, onDismiss: () => void }) {
  return (
    <div className="toast__item">
      <p>{message}</p>
      <button type="button" className="toast__dismiss" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}

export default Toast
