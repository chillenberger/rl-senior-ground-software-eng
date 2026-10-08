/*
This popup component provides reusability for future use. 
*/

import './styles.css'

function Popup({ children, isOpen, onClose }: { children: React.ReactNode, isOpen: boolean, onClose: () => void }) {
  return (
    <div className="popup" onClick={onClose} style={{ display: isOpen ? 'block' : 'none' }}>
      <div className="popup__content" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export default Popup