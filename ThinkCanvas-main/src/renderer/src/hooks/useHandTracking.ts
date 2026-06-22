import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

export type GestureEvent = 
  | { type: 'NONE' }
  | { type: 'THUMB_LEFT' }
  | { type: 'THUMB_RIGHT' }
  | { type: 'PINCH_START', x: number, y: number }
  | { type: 'PINCH_MOVE', x: number, y: number }
  | { type: 'PINCH_END' }
  | { type: 'PAN_START', x: number, y: number }
  | { type: 'PAN_MOVE', x: number, y: number }
  | { type: 'PAN_END' }
  | { type: 'SHAKE' }
  | { type: 'HOVER_START', x: number, y: number }
  | { type: 'HOVER_MOVE', x: number, y: number }
  | { type: 'HOVER_END' }
  | { type: 'ZOOM', scaleDiff: number }
  | { type: 'FINGER_1' }
  | { type: 'FINGER_2' }
  | { type: 'FINGER_3' }
  | { type: 'FINGER_4' }
  | { type: 'FIST' }
  | { type: 'TWO_PALMS' }
  | { type: 'DELETE_PROMPT' }
  | { type: 'DELETE_CONFIRM' }
  | { type: 'DELETE_CANCEL' };

export function useHandTracking(onGesture: (gesture: GestureEvent) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognizerRef = useRef<GestureRecognizer | null>(null);
  const requestRef = useRef<number>(0);
  
  const historyRef = useRef<{ x: number; y: number; time: number }[]>([]);
  const cooldownRef = useRef<number>(0);
  
  const pinchInitTimeRef = useRef<number | null>(null);
  const pinchStateRef = useRef<boolean>(false);
  const panStateRef = useRef<boolean>(false);
  const hoverStateRef = useRef<boolean>(false);
  const shakeCooldownRef = useRef<number>(0);
  const lastTwoHandDistRef = useRef<number | null>(null);
  
  const poseStartRef = useRef<{ pose: string, time: number } | null>(null);
  const poseFiredRef = useRef<boolean>(false);

  const deleteStateStartRef = useRef<number>(0);
  const deletePromptedRef = useRef<boolean>(false);
  const deleteConfirmedRef = useRef<boolean>(false);

  const callbackRef = useRef(onGesture);
  useEffect(() => {
    callbackRef.current = onGesture;
  }, [onGesture]);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        const recognizer = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2
        });

        if (!active) return;
        recognizerRef.current = recognizer;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
             videoRef.current?.play();
             setIsReady(true);
          };
        }
      } catch (err: any) {
        if (active) setError(err.message || "Camera access denied. Please grant permissions.");
      }
    }
    init();

    return () => {
      active = false;
      if (videoRef.current?.srcObject) {
         const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
         tracks.forEach(t => t.stop());
      }
      if (recognizerRef.current) {
        recognizerRef.current.close();
      }
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isReady || !videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastVideoTime = -1;

    function detectFrame() {
      const recognizer = recognizerRef.current;
      if (!recognizer || video.readyState !== 4) {
        requestRef.current = requestAnimationFrame(detectFrame);
        return;
      }

      const nowInMs = Date.now();
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        
        const results = recognizer.recognizeForVideo(video, nowInMs);
        
        if (canvas.width !== video.videoWidth) {
           canvas.width = video.videoWidth;
           canvas.height = video.videoHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const checkFingersUp = (landmarks: any[]) => {
            return [
                landmarks[8].y < landmarks[6].y,
                landmarks[12].y < landmarks[10].y,
                landmarks[16].y < landmarks[14].y,
                landmarks[20].y < landmarks[18].y
            ];
        };

        if (results.landmarks && results.landmarks.length > 0) {
          for (const landmarks of results.landmarks) {
             ctx.fillStyle = "rgba(233, 136, 58, 0.4)";
             for (const l of landmarks) {
               ctx.beginPath();
               const drawX = (1 - l.x) * canvas.width;
               ctx.arc(drawX, l.y * canvas.height, 4, 0, 2 * Math.PI);
               ctx.fill();
             }
          }

          let currentPose: string | null = null;

          if (results.landmarks.length === 2) {
             const l1 = results.landmarks[0];
             const l2 = results.landmarks[1];

             const fUp1 = checkFingersUp(l1);
             const fUp2 = checkFingersUp(l2);
             const isOpen = (fUp: boolean[]) => fUp[0] && fUp[1] && fUp[2] && fUp[3];
             const isFist = (fUp: boolean[]) => !fUp[0] && !fUp[1] && !fUp[2] && !fUp[3];

             if (isOpen(fUp1) && isOpen(fUp2)) {
                 currentPose = 'TWO_PALMS';
                 const dist = Math.hypot(l1[0].x - l2[0].x, l1[0].y - l2[0].y);
                 if (lastTwoHandDistRef.current !== null) {
                     const diff = lastTwoHandDistRef.current - dist;
                     if (Math.abs(diff) > 0.005) {
                        callbackRef.current({ type: 'ZOOM', scaleDiff: diff });
                     }
                 }
                 lastTwoHandDistRef.current = dist;
             } else {
                 lastTwoHandDistRef.current = null;
             }

             const isDeleting = (isOpen(fUp1) && isFist(fUp2)) || (isFist(fUp1) && isOpen(fUp2));

             if (isDeleting) {
                 if (!deleteStateStartRef.current) {
                     deleteStateStartRef.current = nowInMs;
                 } else {
                     const duration = nowInMs - deleteStateStartRef.current;
                     if (duration > 4000) {
                         if (!deleteConfirmedRef.current) {
                             callbackRef.current({ type: 'DELETE_CONFIRM' });
                             deleteConfirmedRef.current = true;
                         }
                     } else if (duration > 2000) {
                         if (!deletePromptedRef.current) {
                             callbackRef.current({ type: 'DELETE_PROMPT' });
                             deletePromptedRef.current = true;
                         }
                     }
                 }
             } else {
                 if (deleteStateStartRef.current) {
                     if (deletePromptedRef.current && !deleteConfirmedRef.current) {
                         callbackRef.current({ type: 'DELETE_CANCEL' });
                     }
                     deleteStateStartRef.current = 0;
                     deletePromptedRef.current = false;
                     deleteConfirmedRef.current = false;
                 }
             }
             
             if (pinchStateRef.current) {
                pinchStateRef.current = false;
                callbackRef.current({ type: 'PINCH_END' });
             }
          } else if (results.landmarks.length === 1) {
              lastTwoHandDistRef.current = null;
              
              if (deleteStateStartRef.current) {
                  if (deletePromptedRef.current && !deleteConfirmedRef.current) {
                      callbackRef.current({ type: 'DELETE_CANCEL' });
                  }
                  deleteStateStartRef.current = 0;
                  deletePromptedRef.current = false;
                  deleteConfirmedRef.current = false;
              }

              const landmarks = results.landmarks[0];
              const wrist = landmarks[0];
              const thumbTip = landmarks[4];
              const indexTip = landmarks[8];
              const fUp = checkFingersUp(landmarks);

              const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
              const isPinchingRaw = pinchDist < 0.08 && !fUp[1] && !fUp[2] && !fUp[3];

              let isPinching = false;
              if (isPinchingRaw) {
                  if (!pinchInitTimeRef.current) {
                      pinchInitTimeRef.current = nowInMs;
                  } else if (nowInMs - pinchInitTimeRef.current > 2000) {
                      isPinching = true;
                  }
              } else {
                  pinchInitTimeRef.current = null;
              }

              if (isPinching) {
                  const x = 1 - indexTip.x;
                  const y = indexTip.y;
                  if (!pinchStateRef.current) {
                      pinchStateRef.current = true;
                      callbackRef.current({ type: 'PINCH_START', x, y });
                  } else {
                      callbackRef.current({ type: 'PINCH_MOVE', x, y });
                  }
              } else {
                  if (pinchStateRef.current) {
                      pinchStateRef.current = false;
                      callbackRef.current({ type: 'PINCH_END' });
                  }
              }

              const indexMCP = landmarks[5];
              const thumbDx = thumbTip.x - indexMCP.x;
              const upCount = fUp.filter(Boolean).length;
              
              // Only consider thumb pointing if it's very pronounced (abs > 0.18)
              const isThumbPointing = Math.abs(thumbDx) > 0.18;
              const isPanning = upCount === 0 && !isPinchingRaw && !isThumbPointing;

              if (isPanning) {
                  const x = 1 - landmarks[9].x; // Middle finger MCP
                  const y = landmarks[9].y;
                  if (!panStateRef.current) {
                      panStateRef.current = true;
                      callbackRef.current({ type: 'PAN_START', x, y });
                  } else {
                      callbackRef.current({ type: 'PAN_MOVE', x, y });
                  }
              } else {
                  if (panStateRef.current) {
                      panStateRef.current = false;
                      callbackRef.current({ type: 'PAN_END' });
                  }
              }

              const palmSize = Math.hypot(landmarks[0].x - landmarks[9].x, landmarks[0].y - landmarks[9].y);
              const middleSpread = Math.hypot(landmarks[0].x - landmarks[12].x, landmarks[0].y - landmarks[12].y);
              const spreadRatio = middleSpread / palmSize;
              const isPartiallyOpen = spreadRatio > 1.2 && spreadRatio < 1.7;

              if (isPartiallyOpen && !isPinchingRaw && !isPanning && !isThumbPointing) {
                  const x = 1 - landmarks[9].x; 
                  const y = landmarks[9].y;
                  if (!hoverStateRef.current) {
                      hoverStateRef.current = true;
                      callbackRef.current({ type: 'HOVER_START', x, y });
                  } else {
                      callbackRef.current({ type: 'HOVER_MOVE', x, y });
                  }
              } else {
                  if (hoverStateRef.current) {
                      if (spreadRatio <= 1.2) {
                          callbackRef.current({ type: 'HOVER_END' });
                          // Simulate close selection here since user said closing it selects that
                          callbackRef.current({ type: 'FIST' });
                          poseFiredRef.current = true; // so FIST delay doesn't fire again
                      } else {
                          callbackRef.current({ type: 'HOVER_END' });
                      }
                      hoverStateRef.current = false;
                  }
              }

              // Shake detection
              const history = historyRef.current;
              history.push({ x: wrist.x, y: wrist.y, time: nowInMs });
              
              while(history.length > 0 && nowInMs - history[0].time > 500) {
                history.shift();
              }
              
              if (history.length > 5 && nowInMs - shakeCooldownRef.current > 1000) {
                 const oldest = history[0];
                 const newest = history[history.length - 1];
                 let totalDx = 0;
                 for (let i = 1; i < history.length; i++) {
                    totalDx += Math.abs(history[i].x - history[i-1].x);
                 }
                 if (totalDx > 0.5 && Math.abs(newest.x - oldest.x) < 0.2) {
                     callbackRef.current({ type: 'SHAKE' });
                     shakeCooldownRef.current = nowInMs;
                     historyRef.current = [];
                 }
              }

              if (!isPinchingRaw) {
                  if (upCount === 0 && isThumbPointing) {
                      if (thumbDx > 0) {
                          currentPose = 'THUMB_RIGHT';
                      } else {
                          currentPose = 'THUMB_LEFT';
                      }
                  } else if (upCount === 0 && !isPanning) currentPose = 'FIST';
                  else if (upCount === 1 && fUp[0]) currentPose = 'FINGER_1';
                  else if (upCount === 2 && fUp[0] && fUp[1]) currentPose = 'FINGER_2';
                  else if (upCount === 3 && fUp[0] && fUp[1] && fUp[2]) currentPose = 'FINGER_3';
                  else if (upCount === 4) currentPose = 'FINGER_4';
              }
          }

          if (currentPose) {
              if (poseStartRef.current?.pose === currentPose) {
                  if (!poseFiredRef.current && nowInMs - poseStartRef.current.time > 2000) {
                      callbackRef.current({ type: currentPose as any });
                      poseFiredRef.current = true;
                  }
              } else {
                  poseStartRef.current = { pose: currentPose, time: nowInMs };
                  poseFiredRef.current = false;
              }
          } else {
              poseStartRef.current = null;
              poseFiredRef.current = false;
          }

        } else {
             if (pinchStateRef.current) {
                  pinchStateRef.current = false;
                  callbackRef.current({ type: 'PINCH_END' });
             }
             if (deleteStateStartRef.current) {
                 if (deletePromptedRef.current && !deleteConfirmedRef.current) {
                     callbackRef.current({ type: 'DELETE_CANCEL' });
                 }
                 deleteStateStartRef.current = 0;
                 deletePromptedRef.current = false;
                 deleteConfirmedRef.current = false;
             }
        }
      }
      requestRef.current = requestAnimationFrame(detectFrame);
    }
    
    setTimeout(() => {
        requestRef.current = requestAnimationFrame(detectFrame);
    }, 100);

    return () => cancelAnimationFrame(requestRef.current);
  }, [isReady]);

  return { videoRef, canvasRef, isReady, error };
}
