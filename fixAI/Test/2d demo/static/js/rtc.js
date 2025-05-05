// static/js/rtc.js

let localStream;
let peerConnection;
const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const socket = io();

// Video elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// Ready to call when close to another player
let readyForCall = false;
let targetPlayerId = null;

// Detect proximity in your game.js and set these flags accordingly!

function startCall(targetId) {
    targetPlayerId = targetId;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream;
            localVideo.srcObject = stream;

            peerConnection = new RTCPeerConnection(configuration);

            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            peerConnection.ontrack = (event) => {
                remoteVideo.srcObject = event.streams[0];
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { candidate: event.candidate, to: targetPlayerId });
                }
            };

            peerConnection.createOffer()
                .then(offer => {
                    peerConnection.setLocalDescription(offer);
                    socket.emit('offer', { offer, to: targetPlayerId });
                });

            document.getElementById('video-call-panel').style.display = 'block';
        })
        .catch(err => {
            console.error('Error accessing media devices.', err);
        });
}

function answerCall(offer, fromId) {
    targetPlayerId = fromId;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream;
            localVideo.srcObject = stream;

            peerConnection = new RTCPeerConnection(configuration);

            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });

            peerConnection.ontrack = (event) => {
                remoteVideo.srcObject = event.streams[0];
            };

            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { candidate: event.candidate, to: targetPlayerId });
                }
            };

            peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
                .then(() => peerConnection.createAnswer())
                .then(answer => {
                    peerConnection.setLocalDescription(answer);
                    socket.emit('answer', { answer, to: targetPlayerId });
                });

            document.getElementById('video-call-panel').style.display = 'block';
        })
        .catch(err => {
            console.error('Error accessing media devices.', err);
        });
}

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    document.getElementById('video-call-panel').style.display = 'none';
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
}

// Socket.IO events

socket.on('offer', (data) => {
    if (!peerConnection) {
        answerCall(data.offer, data.from);
    }
});

socket.on('answer', (data) => {
    peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('ice-candidate', (data) => {
    if (peerConnection) {
        peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
});
