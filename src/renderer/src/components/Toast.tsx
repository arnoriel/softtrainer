import { ToastMsg } from '../App'

interface Props {
  toast: ToastMsg
  onDismiss: () => void
}

export default function Toast({ toast, onDismiss }: Props) {
  return (
    <div className={`toast ${toast.type}`} onClick={onDismiss} title="Click to dismiss">
      {toast.type === 'loading' && <div className="spinner sm" />}
      <span>{toast.message}</span>
    </div>
  )
}
