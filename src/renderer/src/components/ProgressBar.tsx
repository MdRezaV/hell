import React from 'react'
import { useLoading } from '../LoadingContext'
import '../styles/ProgressBar.css'

const ProgressBar: React.FC = () => {
  const { isLoading } = useLoading()

  return (
    <div
      className={`progress-bar${isLoading ? ' progress-bar--active' : ''}`}
      role="progressbar"
      aria-busy={isLoading}
      aria-valuetext={isLoading ? 'Loading' : 'Idle'}
    >
      <div className="progress-bar__track" />
    </div>
  )
}

export default ProgressBar