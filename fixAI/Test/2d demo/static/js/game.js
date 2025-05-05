const config = {
    type: Phaser.AUTO,
    width: 1280,
    height: 960,
    physics: {
        default: 'arcade',
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

let socket;
let otherPlayers = {};
let playerId = Math.random().toString(36).substring(2, 15);
let player;
let whiteboardBubble, computerBubble, booksBubble, aiAssistantBubble;
let whiteboards = [], computers = [];
let booksZone = null, aiAssistantZone = null;
let cursors, eKey;
let moveSpeed = 150;
let nearWhiteboard = null, nearComputer = null, nearBooks = false, nearAI = false;
let screenStream = null;
let vlabZone;
let vlabBubble;
let nearVLab = false;
let currentCallPeerId = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let interactionBubble;
const callProximityThreshold = 120; 



let playerName = `Player-${Math.floor(Math.random() * 1000)}`;
let playerColor = Phaser.Display.Color.RandomRGB().color;


let lastUpdateTime = 0;
const updateInterval = 50; 


const game = new Phaser.Game(config);

function preload() {
    this.load.image('tileset', 'static/assets/map/FloorAndGround.png');
    this.load.image('whiteboardTiles', 'static/assets/items/whiteboard.png');
    this.load.tilemapTiledJSON('map', 'static/assets/map/map.json');
    this.load.image('obj1', 'static/assets/tileset/Classroom_and_library.png');
    this.load.image('obj2', 'static/assets/tileset/Modern_Office_Black_Shadow.png');
    this.load.image('obj3', 'static/assets/tileset/Generic.png');
    this.load.atlas('adam', 'static/assets/character/adam.png', 'static/assets/character/adam.json');
}

function create() {
    const map = this.make.tilemap({ key: 'map' });
    socket = io();
    sendPlayerUpdate();

    const tileset = map.addTilesetImage('FloorAndGround', 'tileset');
    const whiteboardTileset = map.addTilesetImage('whiteboard', 'whiteboardTiles');
    const objectstileset1 = map.addTilesetImage('Classroom_and_library', 'obj1');
    const objectstileset2 = map.addTilesetImage('Modern_Office_Black_Shadow', 'obj2');
    const objectstileset3 = map.addTilesetImage('Generic', 'obj3');

    map.createLayer('ground', tileset, 0, 0);
    map.createLayer('walls', tileset, 0, 0);
    map.createLayer('whiteboard', whiteboardTileset, 0, 0);
    map.createLayer('object', objectstileset2, 0, 0);
    map.createLayer('computer', objectstileset2, 0, 0);
    map.createLayer('library', objectstileset1, 0, 0);
    map.createLayer('lab', objectstileset3, 0, 0);

    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    const collisionLayer = map.getObjectLayer('collision');
    this.collisionGroup = this.physics.add.staticGroup();

    collisionLayer.objects.forEach(obj => {
    const rect = this.add.rectangle(
        obj.x + obj.width/2, 
        obj.y + obj.height/2, 
        obj.width, 
        obj.height
    )
    .setOrigin(0.5, 0.5)
    .setVisible(false);
    
    this.physics.add.existing(rect, true); 
    this.collisionGroup.add(rect);
    });

      
       this.anims.create({
        key: 'adam_idle',
        frames: this.anims.generateFrameNames('adam', {
            start: 1,
            end: 24,
            prefix: 'Adam_idle_anim_',
            suffix: '.png'
        }),
        frameRate: 12,
        repeat: -1
    });

    this.anims.create({
        key: 'adam_run',
        frames: this.anims.generateFrameNames('adam', {
            start: 1,
            end: 24,
            prefix: 'Adam_run_',
            suffix: '.png'
        }),
        frameRate: 15,
        repeat: -1
    });






    socket.on('other_player_update', (data) => {
        if (data.id === playerId) return;
        
        if (!otherPlayers[data.id]) {
            
            otherPlayers[data.id] = this.add.circle(data.x, data.y, 16, 0xff0000)
                .setDepth(5);
        } else {
            
            otherPlayers[data.id].setPosition(data.x, data.y);
        }
    });

    socket.on('current_players', (players) => {
        players.forEach((data) => {
            if (data.id === playerId) return; 
    
            if (!otherPlayers[data.id]) {
                
                otherPlayers[data.id] = this.add.circle(data.x, data.y, 16, 0xff0000)
                    .setDepth(5);
            }
        });
    });


    socket.on('new_player', (data) => {
        if (data.id === playerId) return; 
    
        if (!otherPlayers[data.id]) {
            otherPlayers[data.id] = this.add.circle(data.x, data.y, 16, 0xff0000)
                .setDepth(5);
        }
    });
    
    

    socket.on('player_disconnected', (id) => {
        if (otherPlayers[id]) {
            otherPlayers[id].destroy();
            delete otherPlayers[id];
        }
    });


    socket.on('call_request', (data) => {
        if (!peerConnection) {
            startCall(data.from);
        }
    });
    
    socket.on('call_offer', async (data) => {
        if (!peerConnection) setupPeerConnection();
    
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
    
        socket.emit('call_answer', { to: data.from, answer });
    });
    
    socket.on('call_answer', async (data) => {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    });
    
    socket.on('ice_candidate', async (data) => {
        if (peerConnection) {
            try {
                await peerConnection.addIceCandidate(data.candidate);
            } catch (err) {
                console.error('Error adding received ice candidate', err);
            }
        }
    });


    socket.on('chat_message', (data) => {
        const chat = document.getElementById('chat-messages');
        chat.innerHTML += `<div><b>${data.name || 'Player'}:</b> ${data.text}</div>`;
        chat.scrollTop = chat.scrollHeight;
    });
    
    socket.on('chat_file', (data) => {
        const chat = document.getElementById('chat-messages');
        const fileLink = `<a href="${data.fileData}" download="${data.fileName}" target="_blank">${data.fileName}</a>`;
        chat.innerHTML += `<div><b>${data.name || 'Player'}:</b> Sent a file: ${fileLink}</div>`;
        chat.scrollTop = chat.scrollHeight;
    });
    
    






    const spawnLayer = map.getObjectLayer('spawnpoint');
    const spawnPoint = spawnLayer.objects[0];

    player = this.physics.add.sprite(spawnPoint.x, spawnPoint.y, 'adam', 'Adam_idle_anim_1.png')
        .setSize(32, 48)
        .setCollideWorldBounds(true)
        .setDepth(10);

    player.play('adam_idle');

  
    whiteboardBubble = createBubble(this, "Press E to use Whiteboard");
    computerBubble = createBubble(this, "Press E to use Computer");
    booksBubble = createBubble(this, "Press E to open Library");
    aiAssistantBubble = createBubble(this, "Press E to talk to Assistant");

    
    const whiteboardLayer = map.getObjectLayer("w")?.objects || [];
    whiteboardLayer.forEach(obj => {
        const wb = this.physics.add.staticImage(obj.x + obj.width / 2, obj.y + obj.height / 2, null)
            .setSize(obj.width, obj.height)
            .setOrigin(0.5, 0.5)
            .setVisible(false);
        wb.name = obj.name;
        whiteboards.push(wb);
    });


    const computerLayer = map.getObjectLayer("c")?.objects || [];
    computerLayer.forEach(obj => {
        const comp = this.physics.add.staticImage(obj.x + obj.width / 2, obj.y + obj.height / 2, null)
            .setSize(obj.width, obj.height)
            .setOrigin(0.5, 0.5)
            .setVisible(false);
        comp.name = obj.name;
        computers.push(comp);
    });

   
    const libraryLayer = map.getObjectLayer("lib")?.objects || [];
    libraryLayer.forEach(obj => {
        if (obj.name === "books") {
            booksZone = this.physics.add.staticImage(obj.x + obj.width / 2, obj.y + obj.height / 2, null)
                .setSize(obj.width, obj.height)
                .setOrigin(0.5, 0.5)
                .setVisible(false)
                .setName("booksZone");
        } else if (obj.name === "A") {
            aiAssistantZone = this.physics.add.staticImage(obj.x + obj.width / 2, obj.y + obj.height / 2, null)
                .setSize(obj.width, obj.height)
                .setOrigin(0.5, 0.5)
                .setVisible(false)
                .setName("aiAssistantZone");
        }
    });

     
     const vlabLayer = map.getObjectLayer("li")?.objects || [];
     vlabLayer.forEach(obj => {
         if (obj.name === "v") {  
             vlabZone = this.physics.add.staticImage(obj.x + obj.width / 2, obj.y + obj.height / 2, null)
                 .setSize(obj.width, obj.height)
                 .setOrigin(0.5, 0.5)
                 .setVisible(false)
                 .setName("vlabZone");
         }
     });

     
    vlabBubble = this.add.text(0, 0, 'Press E to enter Virtual Lab', {
        fontSize: '16px',
        backgroundColor: '#000000aa',
        color: '#ffffff',
        padding: { x: 8, y: 4 },
        borderRadius: 8
    }).setVisible(false);



    const shareButton = this.add.text(10, 10, 'Share Game', {
        fontSize: '16px',
        backgroundColor: '#000000aa',
        color: '#ffffff',
        padding: { x: 8, y: 4 }
    })
    .setInteractive()
    .on('pointerdown', () => {
        const url = `${window.location.origin}?join=${playerId}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('Game link copied to clipboard! Share it with others.');
        });
    });



    interactionBubble = createBubble(this, ""); 


const callDiv = document.createElement('div');
callDiv.id = 'video-call';
callDiv.style.position = 'absolute';
callDiv.style.top = '20px';
callDiv.style.right = '20px';
callDiv.style.width = '300px';
callDiv.style.height = '400px';
callDiv.style.background = 'black';
callDiv.style.display = 'none';
callDiv.style.flexDirection = 'column';
callDiv.style.padding = '5px';
callDiv.innerHTML = `
    <video id="localVideo" autoplay muted playsinline style="width: 100%; height: 50%; background: gray;"></video>
    <video id="remoteVideo" autoplay playsinline style="width: 100%; height: 50%; background: gray;"></video>
    <button id="hangupButton">Hang Up</button>
`;
document.body.appendChild(callDiv);

document.getElementById('hangupButton').onclick = () => {
    endCall();
};


document.getElementById('send-button').onclick = () => {
    const text = document.getElementById('chat-input').value.trim();
    const file = document.getElementById('file-input').files[0];

    if (text) {
        socket.emit('chat_message', { text });
        document.getElementById('chat-input').value = '';
    }

    if (file) {
        const reader = new FileReader();
        reader.onload = () => {
            socket.emit('chat_file', {
                fileName: file.name,
                fileData: reader.result
            });
        };
        reader.readAsDataURL(file);
        document.getElementById('file-input').value = '';
    }
};



    
    
    // Enable collision between player and collision group
    this.physics.add.collider(player, this.collisionGroup);
    cursors = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D
    });

    eKey = this.input.keyboard.addKey('E');
}

function update() {
    nearWhiteboard = null;
    nearComputer = null;
    nearBooks = false;
    nearAI = false;
    nearVLab = false;
    vlabBubble.setVisible(false);


    // Movement
    player.setVelocity(0);

    let moving = false;

    if (cursors.left.isDown) {
        player.setVelocityX(-moveSpeed);
        player.setFlipX(true); 
        moving = true;
    }
    if (cursors.right.isDown) {
        player.setVelocityX(moveSpeed);
        player.setFlipX(false); 
        moving = true;
    }
    if (cursors.up.isDown) {
        player.setVelocityY(-moveSpeed);
        moving = true;
    }
    if (cursors.down.isDown) {
        player.setVelocityY(moveSpeed);
        moving = true;
    }

    if (moving) {
        if (player.anims.currentAnim?.key !== 'adam_run') {
            player.anims.play('adam_run', true);
        }
    } else {
        if (player.anims.currentAnim?.key !== 'adam_idle') {
            player.anims.play('adam_idle', true);
        }
    }


    
    whiteboards.forEach(wb => {
        if (Phaser.Math.Distance.Between(player.x, player.y, wb.x, wb.y) < 80) {
            nearWhiteboard = wb;
        }
    });

    computers.forEach(comp => {
        if (Phaser.Math.Distance.Between(player.x, player.y, comp.x, comp.y) < 80) {
            nearComputer = comp;
        }
    });

    if (booksZone && Phaser.Math.Distance.Between(player.x, player.y, booksZone.x, booksZone.y) < 80) {
        nearBooks = true;
    }

    if (aiAssistantZone && Phaser.Math.Distance.Between(player.x, player.y, aiAssistantZone.x, aiAssistantZone.y) < 80) {
        nearAI = true;
    }

   
    whiteboardBubble.setVisible(false);
    computerBubble.setVisible(false);
    booksBubble.setVisible(false);
    aiAssistantBubble.setVisible(false);

   
    if (nearWhiteboard) {
        whiteboardBubble.setPosition(nearWhiteboard.x - 60, nearWhiteboard.y - 60).setVisible(true);
        if (Phaser.Input.Keyboard.JustDown(eKey)) openWhiteboardUI(nearWhiteboard.name);
    } else if (nearComputer) {
        computerBubble.setPosition(nearComputer.x - 60, nearComputer.y - 60).setVisible(true);
        if (Phaser.Input.Keyboard.JustDown(eKey)) openComputerUI(nearComputer.name);
    } else if (nearBooks) {
        booksBubble.setPosition(booksZone.x - 60, booksZone.y - 60).setVisible(true);
        if (Phaser.Input.Keyboard.JustDown(eKey)) {
            window.open('https://ndl.iitkgp.ac.in/', '_blank');
        }
    } else if (nearAI) {
        aiAssistantBubble.setPosition(aiAssistantZone.x - 80, aiAssistantZone.y - 60).setVisible(true);
        if (Phaser.Input.Keyboard.JustDown(eKey)) {
            openAIAssistant();
        }
    }

    if (vlabZone && Phaser.Math.Distance.Between(player.x, player.y, vlabZone.x, vlabZone.y) < 80) {
        nearVLab = true;
    }

    if (nearVLab) {
        vlabBubble.setPosition(vlabZone.x - 60, vlabZone.y - 60).setVisible(true);
        
        if (Phaser.Input.Keyboard.JustDown(eKey)) {
            window.open('https://www.vlab.co.in/', '_blank');
        }
    }

    if (this.time.now % 10 === 0) {
        sendPlayerUpdate();
    }



    let nearPlayerId = null;

for (let id in otherPlayers) {
    const other = otherPlayers[id];
    const dist = Phaser.Math.Distance.Between(player.x, player.y, other.x, other.y);
    if (dist < callProximityThreshold) {
        nearPlayerId = id;
        break;
    }
}

if (nearPlayerId && !currentCallPeerId) {
    interactionBubble.setText(`Press E to call`).setPosition(player.x - 60, player.y - 80).setVisible(true);
    if (Phaser.Input.Keyboard.JustDown(eKey)) {
        startCall(nearPlayerId);
    }
} else {
    interactionBubble.setVisible(false);
}


if (currentCallPeerId) {
    const other = otherPlayers[currentCallPeerId];
    if (other) {
        const dist = Phaser.Math.Distance.Between(player.x, player.y, other.x, other.y);
        if (dist > 200) { 
            endCall();
        }
    }
}


    
}

function createBubble(scene, text) {
    return scene.add.text(0, 0, text, {
        fontSize: "16px",
        fill: "#fff",
        backgroundColor: "#000",
        padding: { x: 10, y: 5 }
    }).setDepth(1000).setVisible(false);
}


function openWhiteboardUI(name) {
    // Create the container if it doesn't exist
    if (!document.getElementById("whiteboardPopup")) {
        const popup = document.createElement('div');
        popup.id = "whiteboardPopup";
        popup.style.position = "absolute";
        popup.style.top = "50px";
        popup.style.left = "50px";
        popup.style.width = "90%";
        popup.style.height = "90%";
        popup.style.backgroundColor = "white";
        popup.style.border = "3px solid black";
        popup.style.zIndex = "10000";
        popup.style.display = "flex";
        popup.style.flexDirection = "column";

        popup.innerHTML = `
            <div style="background: black; color: white; padding: 10px;">
                <span>Whiteboard: ${name}</span>
                <button onclick="closeWhiteboardUI()" style="float:right; background:red; color:white;">Close</button>
            </div>
            <iframe id="excalidrawFrame" src="https://excalidraw.com/" style="flex:1; border: none;"></iframe>
        `;

        document.body.appendChild(popup);
    } else {
        document.getElementById("whiteboardPopup").style.display = "flex";
    }
}

function closeWhiteboardUI() {
    const popup = document.getElementById("whiteboardPopup");
    if (popup) popup.style.display = "none";
}


function openComputerUI(name) {
    document.getElementById("computerUI").style.display = "block";
    document.getElementById("computerName").textContent = name;
    startScreenShare();
}
function closeComputerUI() {
    stopScreenShare();
    document.getElementById("computerUI").style.display = "none";
}


async function startScreenShare() {
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: "always" },
            audio: false
        });
        const videoElem = document.getElementById("screenPreview");
        videoElem.srcObject = screenStream;
        screenStream.getVideoTracks()[0].addEventListener("ended", () => {
            stopScreenShare();
        });
    } catch (err) {
        console.error("Screen share error:", err);
        alert("Screen share cancelled or failed.");
        closeComputerUI();
    }
}
function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    const videoElem = document.getElementById("screenPreview");
    if (videoElem) videoElem.srcObject = null;
}

async function openAIAssistant() {
   
    const existingChat = document.getElementById('ai-chat');
    if (existingChat) existingChat.remove();

    const chatBox = document.createElement('div');
    chatBox.id = 'ai-chat';
    chatBox.style.position = 'absolute';
    chatBox.style.top = '120px';
    chatBox.style.left = '120px';
    chatBox.style.width = '320px';
    chatBox.style.height = '480px';
    chatBox.style.background = 'white';
    chatBox.style.border = '2px solid black';
    chatBox.style.padding = '10px';
    chatBox.style.overflow = 'hidden';
    chatBox.style.zIndex = '10000';
    chatBox.innerHTML = `
        <h3>AI Assistant</h3>
        <div id="ai-chat-messages" style="height: 300px; overflow-y: auto; border: 1px solid gray; margin-bottom: 10px; padding:5px;"></div>
        <input id="ai-chat-input" type="text" placeholder="Ask something..." style="width: 95%;"><br><br>
        <input id="ai-file-upload" type="file" style="width: 95%;"><br><br>
        <button id="ai-send-button" style="width: 45%;">Send</button>
        <button id="ai-close-chat" style="width: 45%; float:right;">Close</button>
    `;
    document.body.appendChild(chatBox);

    
    const sendBtn = document.getElementById('ai-send-button');
    const chatInput = document.getElementById('ai-chat-input');
    const closeBtn = document.getElementById('ai-close-chat');
    const messages = document.getElementById('ai-chat-messages');

    const sendMessage = async () => {
        const userInput = chatInput.value.trim();
        const fileInput = document.getElementById('ai-file-upload');
        const file = fileInput.files[0];
        
        if (!userInput && !file) {
            alert('Please enter a message or upload a file.');
            return;
        }

        if (userInput) {
            messages.innerHTML += `<div><b>You:</b> ${userInput}</div>`;
        }
        
        if (file) {
            messages.innerHTML += `<div><b>You:</b> [Uploaded file: ${file.name}]</div>`;
        }
        
        messages.scrollTop = messages.scrollHeight;

        let fileContent = '';
        if (file) {
            try {
                fileContent = await readFileContent(file);
            } catch (error) {
                console.error('Error reading file:', error);
                messages.innerHTML += `<div style="color:red;">Error reading file.</div>`;
                messages.scrollTop = messages.scrollHeight;
                return;
            }
        }

        let combinedInput = '';
        if (fileContent && userInput) {
            combinedInput = `Here is the uploaded file content:\n${fileContent}\n\nQuestion:\n${userInput}`;
        } else if (fileContent) {
            combinedInput = `Please process this uploaded file content:\n${fileContent}`;
        } else {
            combinedInput = userInput;
        }

        const loadingId = `loading-${Date.now()}`;
        messages.innerHTML += `<div id="${loadingId}"><i>AI is thinking...</i></div>`;
        messages.scrollTop = messages.scrollHeight;

        try {
            const aiReply = await getAIResponse(combinedInput);
            
            
            const loadingElem = document.getElementById(loadingId);
            if (loadingElem) loadingElem.remove();
            
            messages.innerHTML += `<div><b>AI:</b> ${aiReply}</div>`;
        } catch (error) {
            console.error('Error sending message to AI server:', error);
          
            const loadingElem = document.getElementById(loadingId);
            if (loadingElem) loadingElem.remove();
            
            messages.innerHTML += `<div style="color:red;"><b>Error contacting AI server.</b></div>`;
        }

        chatInput.value = '';
        fileInput.value = '';
        messages.scrollTop = messages.scrollHeight;
    };


    sendBtn.addEventListener('click', sendMessage);
    
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    closeBtn.addEventListener('click', () => {
        chatBox.remove();
    });
}

async function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsText(file); // We assume text files
    });
}

async function getAIResponse(userInput) {
    try {
        console.log("Sending request to AI server...");
        const response = await fetch('/api/ask_ai', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: userInput
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('API error:', errorData);
            throw new Error(errorData.error || 'Unknown server error');
        }

        const data = await response.json();
        console.log("Got AI response:", data);
        return data.response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

function sendPlayerUpdate() {
    if (socket && player) {
        socket.emit('player_update', {
            id: playerId,
            x: player.x,
            y: player.y
        });
    }
}


function startCall(peerId) {
    currentCallPeerId = peerId;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
            localStream = stream;
            document.getElementById('localVideo').srcObject = stream;
            document.getElementById('video-call').style.display = 'flex';

            socket.emit('call_request', { to: peerId });

            setupPeerConnection();

            stream.getTracks().forEach(track => {
                peerConnection.addTrack(track, stream);
            });
        }).catch(err => {
            console.error("Failed to get media:", err);
        });
}

function setupPeerConnection() {
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            socket.emit('ice_candidate', { to: currentCallPeerId, candidate: event.candidate });
        }
    };

    peerConnection.ontrack = event => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            document.getElementById('remoteVideo').srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);
    };
}

function endCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    remoteStream = null;
    currentCallPeerId = null;
    document.getElementById('video-call').style.display = 'none';
}
