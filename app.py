from flask import Flask, render_template, jsonify, request
from flask_sqlalchemy import SQLAlchemy
import json
from datetime import datetime # ¡Necesario para el cálculo de tiempo!
import math # ¡Necesario para el costo dinámico!

# --- Configuración Inicial ---
app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///game.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Definiciones del Juego (Hardcoded) ---
GAME_CONTRACTS = {
    'fix_bug': {'name': 'Corregir un Bug', 'energy_cost': 10, 'money_reward': 50, 'xp_reward': 10},
    'build_website': {'name': 'Crear Web Simple', 'energy_cost': 30, 'money_reward': 200, 'xp_reward': 50},
    'data_analysis': {'name': 'Analizar Datos', 'energy_cost': 50, 'money_reward': 450, 'xp_reward': 100}
}

GAME_STORE_ITEMS = {
    'coffee': {'name': 'Café', 'cost': 25, 'effect_description': 'Restaura toda la energía'},
    'ergonomic_chair': {'name': 'Silla Ergonómica', 'cost': 300, 'effect_description': '+25 Energía Máxima'},
    'faster_pc': {'name': 'PC Más Rápida', 'cost': 1000, 'effect_description': '+50% Dinero por contrato'},
    # --- ¡NUEVO ÍTEM! ---
    'dev_junior': {'name': 'Contratar Dev Jr.', 'base_cost': 500, 'effect_description': 'Gana $10/seg (automático)'}
}

# --- Modelo de la Base de Datos (BBDD) ---
class PlayerState(db.Model):
    id = db.Column(db.Integer, primary_key=True) # Usaremos 1 para el jugador
    money = db.Column(db.Integer, default=100)
    energy = db.Column(db.Integer, default=100)
    max_energy = db.Column(db.Integer, default=100)
    xp = db.Column(db.Integer, default=0)
    level = db.Column(db.Integer, default=1)
    upgrades = db.Column(db.String(500), default='[]')
    
    # --- ¡NUEVAS COLUMNAS! ---
    junior_devs = db.Column(db.Integer, default=0) # Número de empleados
    last_updated = db.Column(db.DateTime, default=datetime.utcnow) # Timestamp

# --- Funciones Helper ---
def get_player_state():
    """ Busca al jugador 1. Si no existe, lo creamos (primera vez que juega) """
    player = PlayerState.query.get(1)
    if not player:
        player = PlayerState(id=1, last_updated=datetime.utcnow())
        db.session.add(player)
        db.session.commit()
    return player

# --- ¡NUEVA FUNCIÓN DE LÓGICA "IDLE"! ---
def _calculate_passive_income(player):
    """ Calcula y añade el dinero ganado desde la última conexión """
    time_now = datetime.utcnow()
    # Asegurarse de que last_updated no sea None (para migraciones de BBDD antiguas)
    if player.last_updated is None:
        player.last_updated = time_now

    time_elapsed = (time_now - player.last_updated).total_seconds()
    
    # Calcular ingresos (10 por segundo por cada dev)
    income_per_second = player.junior_devs * 10
    money_earned = int(time_elapsed * income_per_second)
    
    if money_earned > 0:
        player.money += money_earned
    
    # Actualizar el timestamp
    player.last_updated = time_now
    # Nota: No hacemos commit aquí, se hará en la función que llamó a esta.

def _get_player_state_dict():
    """ Devuelve el estado del jugador como un diccionario de Python """
    player = get_player_state()
    
    # ¡Calcula los ingresos pasivos ANTES de devolver el estado!
    _calculate_passive_income(player)
    
    # Hacemos commit de los cambios (dinero pasivo y timestamp)
    db.session.commit()
    
    return {
        'money': player.money,
        'energy': player.energy,
        'max_energy': player.max_energy,
        'xp': player.xp,
        'level': player.level,
        'xp_to_next_level': player.level * 100, 
        'upgrades': json.loads(player.upgrades),
        'junior_devs': player.junior_devs,
        'passive_income': player.junior_devs * 10 # Ingreso por segundo
    }

# --- Rutas de la API del Juego (Endpoints) ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/get_game_state', methods=['GET'])
def get_game_state():
    return jsonify(_get_player_state_dict())

@app.route('/api/get_definitions', methods=['GET'])
def get_definitions():
    return jsonify({
        'contracts': GAME_CONTRACTS,
        'store_items': GAME_STORE_ITEMS
    })

@app.route('/api/do_contract', methods=['POST'])
def do_contract():
    contract_id = request.json.get('contract_id')
    if contract_id not in GAME_CONTRACTS:
        return jsonify({'error': 'Contrato no existe'}), 400
    
    contract = GAME_CONTRACTS[contract_id]
    player = get_player_state()
    
    # ¡Calcula ingresos pasivos antes de cualquier acción!
    _calculate_passive_income(player)
    
    if player.energy < contract['energy_cost']:
        db.session.commit() # Guardar el dinero pasivo aunque falle el contrato
        return jsonify({'error': 'No tienes suficiente energía'}), 400
    
    player.energy -= contract['energy_cost']
    
    upgrades = json.loads(player.upgrades)
    money_bonus = 1.0
    if 'faster_pc' in upgrades:
        money_bonus = 1.5
        
    player.money += int(contract['money_reward'] * money_bonus)
    player.xp += contract['xp_reward']
    
    xp_needed = player.level * 100
    if player.xp >= xp_needed:
        player.level += 1
        player.xp -= xp_needed
        player.max_energy += 10
        player.energy = player.max_energy
        
    db.session.commit()
    return jsonify({'success': True, 'new_state': _get_player_state_dict()})

@app.route('/api/buy_item', methods=['POST'])
def buy_item():
    item_id = request.json.get('item_id')
    if item_id not in GAME_STORE_ITEMS:
        return jsonify({'error': 'Item no existe'}), 400
    
    item = GAME_STORE_ITEMS[item_id]
    player = get_player_state()
    upgrades = json.loads(player.upgrades)
    
    # ¡Calcula ingresos pasivos antes de cualquier acción!
    _calculate_passive_income(player)

    # Lógica de compra
    if item_id == 'coffee':
        if player.money < item['cost']:
            db.session.commit() # Guardar dinero pasivo
            return jsonify({'error': 'No tienes suficiente dinero'}), 400
        player.money -= item['cost']
        player.energy = player.max_energy
        
    elif item_id == 'ergonomic_chair' or item_id == 'faster_pc':
        if player.money < item['cost']:
            db.session.commit()
            return jsonify({'error': 'No tienes suficiente dinero'}), 400
        if item_id not in upgrades:
            player.money -= item['cost']
            upgrades.append(item_id)
            if item_id == 'ergonomic_chair':
                player.max_energy += 25
        else:
             db.session.commit()
             return jsonify({'error': 'Ya tienes este item'}), 400
             
    # --- ¡NUEVA LÓGICA DE COMPRA PARA DEV JR! ---
    elif item_id == 'dev_junior':
        # Costo dinámico: cost = base_cost * (1.15 ^ num_devs)
        dynamic_cost = int(item['base_cost'] * math.pow(1.15, player.junior_devs))
        
        if player.money < dynamic_cost:
            db.session.commit()
            return jsonify({'error': 'No tienes suficiente dinero'}), 400
            
        player.money -= dynamic_cost
        player.junior_devs += 1
            
    player.upgrades = json.dumps(upgrades)
    db.session.commit()
    return jsonify({'success': True, 'new_state': _get_player_state_dict()})

@app.route('/api/reset_game', methods=['POST'])
def reset_game():
    player = get_player_state()
    
    player.money = 100
    player.energy = 100
    player.max_energy = 100
    player.xp = 0
    player.level = 1
    player.upgrades = '[]'
    
    # --- ¡RESETEAR NUEVOS CAMPOS! ---
    player.junior_devs = 0
    player.last_updated = datetime.utcnow()
    
    db.session.commit()
    return jsonify({'success': True, 'new_state': _get_player_state_dict()})

# --- Inicialización ---
with app.app_context():
    db.create_all()
    get_player_state() 
    
if __name__ == '__main__':
    app.run(debug=True)