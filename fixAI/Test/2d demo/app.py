from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
from collections import defaultdict
import os
import time
import requests
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your_secret_key'
socketio = SocketIO(app, cors_allowed_origins="*")

players = defaultdict(dict)


OPENAI_API_KEY = ''

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/ask_ai', methods=['POST'])
def ask_ai():
    time.sleep(5) 
    try:
        data = request.json
        user_input = data.get('message', '')
        
        if not OPENAI_API_KEY:
            return jsonify({'error': 'API key not configured'}), 500
            
        
        response = requests.post(
            'https://api.openai.com/v1/chat/completions',
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {OPENAI_API_KEY}'
            },
            json={
                'model': 'gpt-3.5-turbo',
                'messages': [{'role': 'user', 'content': user_input}]
            }
        )
        
        response_data = response.json()
        
        if response.status_code != 200:
            return jsonify({'error': response_data.get('error', {}).get('message', 'Unknown API error')}), response.status_code
            
        ai_response = response_data['choices'][0]['message']['content'].strip()
        return jsonify({'response': ai_response})
        
    except Exception as e:
        print(f"Error in ask_ai: {str(e)}")
        return jsonify({'error': str(e)}), 500

@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    if sid in players:
        emit('player_disconnected', {'id': sid}, broadcast=True)
        del players[sid]
    print(f'Client disconnected: {sid}')

@socketio.on('player_update')
def handle_player_update(data):
    sid = request.sid
    players[sid] = data
    players[sid]['id'] = sid  
    
    
    emit('other_player_update', data, broadcast=True, include_self=False)

@socketio.on('join_game')
def handle_join_game(data):
    sid = request.sid
    players[sid] = {
        'id': sid,
        'x': data.get('x', 100),
        'y': data.get('y', 100),
        'color': data.get('color', get_random_color()),
        'name': data.get('name', f'Player-{sid[:4]}')
    }
    #
    emit('current_players', list(players.values()))
    
    
    emit('new_player', players[sid], broadcast=True, include_self=False)

def get_random_color():
    import random
    colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff]
    return random.choice(colors)

@socketio.on('call_request')
def handle_call_request(data):
    emit('call_request', {'from': request.sid}, to=data['to'])

@socketio.on('call_offer')
def handle_call_offer(data):
    emit('call_offer', {'from': request.sid, 'offer': data['offer']}, to=data['to'])

@socketio.on('call_answer')
def handle_call_answer(data):
    emit('call_answer', {'from': request.sid, 'answer': data['answer']}, to=data['to'])

@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    emit('ice_candidate', {'from': request.sid, 'candidate': data['candidate']}, to=data['to'])

@socketio.on('chat_message')
def handle_chat_message(data):
    name = players.get(request.sid, {}).get('name', 'Player')
    emit('chat_message', {'text': data['text'], 'name': name}, broadcast=True)

@socketio.on('chat_file')
def handle_chat_file(data):
    name = players.get(request.sid, {}).get('name', 'Player')
    emit('chat_file', {'fileName': data['fileName'], 'fileData': data['fileData'], 'name': name}, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True)