// frontend/src/hooks/useWebRTC.ts
import { useState, useEffect, useRef, useCallback } from "react";
import { Socket } from "socket.io-client";

// Basic STUN server configuration (Google's public STUN servers)
// For production, you'd likely need your own STUN/TURN servers.
const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
  ],
};

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startLocalStream: (
    constraints?: MediaStreamConstraints,
  ) => Promise<MediaStream | null>;
  initiateCall: (targetSocketId: string, duelId?: string) => void; // Caller creates offer using its own localStream
  isReceivingCall: boolean; // True if an offer was received and we are preparing an answer
  isCallInProgress: boolean; // True if connection is established or trying
  peerConnection: React.MutableRefObject<RTCPeerConnection | null>;
  closeConnection: () => void;
  errorMessage: string | null;
}

export const useWebRTC = (
  socket: Socket | null,
  localUserSocketId: string | undefined, // The current user's own socket ID
): UseWebRTCReturn => {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null); // Store local stream here
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isNegotiating, setIsNegotiating] = useState(false);
  const [isReceivingCall, setIsReceivingCall] = useState(false);
  const [isCallInProgress, setIsCallInProgress] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const setLocalStream = (stream: MediaStream | null) => {
    localStreamRef.current = stream;
    // Force re-render or notify parent if localStream state is needed externally for UI
    // For this hook, we'll return localStreamRef.current directly.
  };

  const startLocalStream = useCallback(
    async (
      constraints?: MediaStreamConstraints,
    ): Promise<MediaStream | null> => {
      setErrorMessage(null);
      const defaultConstraints: MediaStreamConstraints = {
        video: true,
        audio: true,
      };
      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          constraints || defaultConstraints,
        );
        setLocalStream(stream); // Update the ref
        console.log("WebRTC: Local stream acquired via hook.");
        return stream;
      } catch (error: any) {
        console.error("Error accessing media devices.", error);
        setErrorMessage(
          `Error accessing media: ${error.name} - ${error.message}`,
        );
        setLocalStream(null);
        return null;
      }
    },
    [],
  );

  const closeConnection = useCallback(() => {
    console.log("WebRTC: Closing connection manually via hook");
    if (peerConnectionRef.current) {
      peerConnectionRef.current.getTransceivers().forEach((transceiver) => {
        if (transceiver.sender && transceiver.sender.track) {
          transceiver.sender.track.stop();
        }
        if (transceiver.receiver && transceiver.receiver.track) {
          transceiver.receiver.track.stop();
        }
        if (transceiver.stop) transceiver.stop();
      });
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    // Note: localStreamRef tracks are stopped when the stream itself is stopped by the component
    // Or, if this hook exclusively owns the local stream, it could stop it here too.
    // For now, assume component calling startLocalStream manages stopping its tracks.
    setRemoteStream(null);
    setIsNegotiating(false);
    setIsReceivingCall(false);
    setIsCallInProgress(false);
  }, []);

  const createPeerConnection = useCallback(
    (targetSocketId: string, duelIdForSignal?: string) => {
      if (!localUserSocketId) {
        console.error(
          "WebRTC: Cannot create peer connection without localUserSocketId.",
        );
        setErrorMessage("Local user ID not available for WebRTC.");
        return null;
      }
      // If a connection already exists for this hook instance, close it before creating a new one.
      // This hook instance is designed for a single P2P connection.
      if (peerConnectionRef.current) {
        console.warn(
          "WebRTC: Existing peer connection found, closing it before creating new one for target:",
          targetSocketId,
        );
        closeConnection();
      }

      console.log(
        `WebRTC: Creating new PeerConnection for target ${targetSocketId} (My ID: ${localUserSocketId})`,
      );
      setErrorMessage(null);
      const pc = new RTCPeerConnection(RTC_CONFIGURATION);
      peerConnectionRef.current = pc;
      setIsCallInProgress(true);

      pc.onicecandidate = (event) => {
        if (event.candidate && socket?.connected && localUserSocketId) {
          socket.emit("webrtcSignal", {
            to: targetSocketId,
            data: { type: "candidate", candidate: event.candidate },
            duelId: duelIdForSignal, // Include duelId for context on backend/other client
          });
        }
      };

      pc.ontrack = (event) => {
        console.log(
          `WebRTC: Received remote track from ${targetSocketId}`,
          event.streams[0],
        );
        if (event.streams && event.streams[0]) {
          setRemoteStream(event.streams[0]);
        } else {
          // Fallback for older browsers or specific scenarios
          const newStream = new MediaStream();
          newStream.addTrack(event.track);
          setRemoteStream(newStream);
        }
      };

      pc.onnegotiationneeded = async () => {
        if (
          !localUserSocketId ||
          isNegotiating ||
          !peerConnectionRef.current ||
          peerConnectionRef.current.signalingState !== "stable"
        ) {
          return;
        }
        try {
          console.log(
            `WebRTC: Negotiation needed with ${targetSocketId}, creating offer (My ID: ${localUserSocketId}).`,
          );
          setIsNegotiating(true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socket?.connected) {
            socket.emit("webrtcSignal", {
              to: targetSocketId,
              data: { type: "offer", sdp: pc.localDescription },
              duelId: duelIdForSignal,
            });
          }
        } catch (err: any) {
          console.error(
            "WebRTC: Error during offer creation (onnegotiationneeded):",
            err,
          );
          setErrorMessage(`Offer creation error: ${err.message}`);
        } finally {
          setIsNegotiating(false);
        }
      };

      pc.onconnectionstatechange = () => {
        if (!peerConnectionRef.current) return;
        console.log(
          `WebRTC: Connection state with target ${targetSocketId} changed to ${peerConnectionRef.current.connectionState}`,
        );
        if (
          peerConnectionRef.current.connectionState === "disconnected" ||
          peerConnectionRef.current.connectionState === "closed" ||
          peerConnectionRef.current.connectionState === "failed"
        ) {
          setErrorMessage(
            `Connection with ${targetSocketId} ${peerConnectionRef.current.connectionState}.`,
          );
          closeConnection(); // Clean up on terminal states
        } else if (peerConnectionRef.current.connectionState === "connected") {
          setErrorMessage(null); // Clear error on successful connection
        }
        setIsCallInProgress(
          peerConnectionRef.current.connectionState === "connecting" ||
            peerConnectionRef.current.connectionState === "connected",
        );
      };

      // Add local tracks if localStream is already available
      if (localStreamRef.current) {
        console.log(
          `WebRTC: Adding existing local stream tracks to PeerConnection for ${targetSocketId}`,
        );
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      } else {
        console.warn(
          `WebRTC: No local stream to add initially for PC with ${targetSocketId}. Will be added if startLocalStream is called and then tracks are added.`,
        );
      }
      return pc;
    },
    [socket, localUserSocketId, isNegotiating, closeConnection],
  ); // localStreamRef.current is not a dependency here to avoid re-creating PC just for stream change

  // To be called by the "caller" side
  const initiateCall = useCallback(
    async (targetSocketId: string, duelId?: string) => {
      if (!socket || !localUserSocketId) {
        console.warn(
          "WebRTC: Socket or localUserSocketId not available for initiating call.",
        );
        return;
      }
      if (!localStreamRef.current) {
        console.warn("WebRTC: Local stream not started. Cannot initiate call.");
        setErrorMessage("Camera not started. Please enable your camera first.");
        return;
      }

      console.log(
        `WebRTC: Initiating call from ${localUserSocketId} to ${targetSocketId}`,
      );
      setErrorMessage(null);
      const pc =
        peerConnectionRef.current &&
        peerConnectionRef.current.signalingState !== "closed"
          ? peerConnectionRef.current
          : createPeerConnection(targetSocketId, duelId);
      if (!pc) {
        console.error(
          "WebRTC: Failed to get/create peer connection for initiateCall.",
        );
        return;
      }

      // Add tracks if not already added (e.g., if PC was created before stream)
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          if (!pc.getSenders().find((s) => s.track === track)) {
            console.log(
              "WebRTC (initiateCall): Adding track to PC",
              track.kind,
            );
            pc.addTrack(track, localStreamRef.current!);
          }
        });
      } else {
        // This case should be prevented by the check above
        console.error(
          "WebRTC (initiateCall): Local stream is null, cannot add tracks.",
        );
        return;
      }

      // The onnegotiationneeded event should ideally handle offer creation.
      // However, sometimes it's not triggered reliably after addTrack if PC was already stable.
      // Forcing offer creation if stable and no offer has been made.
      if (pc.signalingState === "stable" && !isNegotiating) {
        try {
          console.log(
            `WebRTC: Manually triggering offer for ${targetSocketId} after ensuring tracks.`,
          );
          setIsNegotiating(true);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (socket?.connected) {
            socket.emit("webrtcSignal", {
              to: targetSocketId,
              data: { type: "offer", sdp: pc.localDescription },
              duelId,
            });
          }
        } catch (err: any) {
          console.error("WebRTC: Error creating offer in initiateCall:", err);
          setErrorMessage(`Offer creation error: ${err.message}`);
        } finally {
          setIsNegotiating(false);
        }
      }
    },
    [socket, localUserSocketId, createPeerConnection, isNegotiating],
  );

  // Effect to handle incoming WebRTC signals from the server
  useEffect(() => {
    if (!socket || !localUserSocketId) return;

    const handleSignal = async (signalData: {
      from: string;
      data: any;
      duelId?: string;
    }) => {
      const { from: senderSocketId, data, duelId: signalDuelId } = signalData;
      // console.log(`WebRTC: Received signal from ${senderSocketId} (My ID: ${localUserSocketId}):`, data.type);
      setErrorMessage(null);

      let pc = peerConnectionRef.current;

      // If no PC exists, or if it's for a different peer, create one for this sender.
      // This is crucial for the callee (receiver of offer) to set up their PC.
      if (!pc || (pc && pc.connectionState === "closed")) {
        // Check if current PC is closed or for a different target
        console.log(
          `WebRTC: No active PC, creating/re-creating one for incoming signal from ${senderSocketId}`,
        );
        pc = createPeerConnection(senderSocketId, signalDuelId); // localStreamRef.current will be added if it exists
        if (!pc) {
          console.error("WebRTC: Failed to create PC on signal.");
          return;
        }
      }

      try {
        if (data.type === "offer") {
          setIsReceivingCall(true); // Indicate we're processing an incoming call
          if (pc.signalingState !== "stable") {
            // Offer glare handling or unexpected state
            console.warn(
              `WebRTC: Received offer from ${senderSocketId} but current signalingState is ${pc.signalingState}. Attempting to handle.`,
            );
            // More complex glare handling might be needed, e.g., rollback. For now, proceed if not 'closed'.
            if (pc.signalingState === "closed") {
              console.error("WebRTC: PC is closed, cannot process offer.");
              setIsReceivingCall(false);
              return;
            }
            // If have-local-offer or have-remote-offer, it's glare.
            // A simple strategy: if my ID is "larger", I ignore their offer and they should accept mine. (Not implemented here for simplicity)
          }
          console.log(
            `WebRTC: Received offer from ${senderSocketId}, setting remote description.`,
          );
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

          // Add local tracks if stream exists (important for the answer)
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach((track) => {
              if (!pc.getSenders().find((s) => s.track === track)) {
                pc.addTrack(track, localStreamRef.current!);
              }
            });
          } else {
            console.log(
              `WebRTC: No local stream to send in response to offer from ${senderSocketId}. Will send answer without video/audio tracks from me.`,
            );
          }

          console.log(`WebRTC: Creating answer for ${senderSocketId}.`);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          if (socket?.connected) {
            socket.emit("webrtcSignal", {
              to: senderSocketId,
              data: { type: "answer", sdp: pc.localDescription },
              duelId: signalDuelId,
            });
          }
          setIsReceivingCall(false);
          setIsCallInProgress(true);
        } else if (data.type === "answer") {
          if (
            pc.signalingState === "have-local-offer" ||
            pc.signalingState ===
              "stable" /* Can be stable if remote answered quickly */
          ) {
            console.log(
              `WebRTC: Received answer from ${senderSocketId}, setting remote description.`,
            );
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            setIsCallInProgress(true);
          } else {
            console.warn(
              `WebRTC: Received answer from ${senderSocketId} but signalingState is ${pc.signalingState}. Ignoring.`,
            );
          }
        } else if (data.type === "candidate" && data.candidate) {
          if (pc.remoteDescription) {
            // Only add candidate if remote description is set
            try {
              // console.log(`WebRTC: Received ICE candidate from ${senderSocketId}, adding.`);
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
            } catch (iceError: any) {
              console.warn(
                "WebRTC: Error adding ICE candidate:",
                iceError.message,
              );
            }
          } else {
            console.warn(
              `WebRTC: Received ICE candidate from ${senderSocketId} before remote description was set. Candidate might be lost or needs buffering.`,
            );
            // TODO: Implement candidate buffering if issues arise.
          }
        }
      } catch (err: any) {
        console.error("WebRTC: Error handling signal:", err);
        setErrorMessage(`Signal handling error: ${err.message}`);
        setIsReceivingCall(false);
      }
    };

    socket.on("webrtcSignal", handleSignal);
    return () => {
      socket.off("webrtcSignal", handleSignal);
    };
  }, [socket, localUserSocketId, createPeerConnection]); // Removed localStreamRef.current from deps to avoid re-subscribing on stream changes

  return {
    localStream: localStreamRef.current,
    remoteStream,
    startLocalStream,
    initiateCall,
    isReceivingCall,
    isCallInProgress,
    peerConnection: peerConnectionRef,
    closeConnection,
    errorMessage,
  };
};
