import { Camera, CameraOff, Video } from "lucide-react"

interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement>
  canvasRef: React.RefObject<HTMLCanvasElement>
  isReady: boolean
  error: string | null
}

export function CameraFeed({ videoRef, canvasRef, isReady, error }: CameraFeedProps) {
  return (
    <div className="tc-camera">
      <div className="tc-camera__status">
        {error ? (
          <><CameraOff size={14} style={{ color: '#ff7a7a' }} /> Error</>
        ) : isReady ? (
          <><Video size={14} style={{ color: '#4ade80' }} /> Tracking Active</>
        ) : (
          <><Camera size={14} style={{ color: '#facc15' }} /> Connecting...</>
        )}
      </div>

      {error ? (
        <div className="tc-camera__error">
          {error}
        </div>
      ) : (
        <div className="tc-camera__view">
          <video
            ref={videoRef}
            className="tc-camera__video"
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            className="tc-camera__canvas"
          />
        </div>
      )}
    </div>
  )
}
