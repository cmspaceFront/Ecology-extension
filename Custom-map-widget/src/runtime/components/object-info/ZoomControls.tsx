/** @jsx jsx */
import { jsx } from 'jimu-core';

interface ZoomControlsProps {
  onZoomIn: () => void | Promise<void>;
  onZoomOut: () => void | Promise<void>;
}

const ZoomControls = ({ onZoomIn, onZoomOut }: ZoomControlsProps) => {
  return (
    <div className="zoom-controls">
      <button
        className="zoom-btn zoom-in"
        onClick={onZoomIn}
        aria-label="Zoom in"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        className="zoom-btn zoom-out"
        onClick={onZoomOut}
        aria-label="Zoom out"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
};

export default ZoomControls;

