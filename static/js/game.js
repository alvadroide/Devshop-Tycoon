document.addEventListener('DOMContentLoaded', () => {

    // --- Referencias al DOM ---
    const moneyDisplay = document.getElementById('money');
    const energyDisplay = document.getElementById('energy');
    const energyBar = document.getElementById('energy-bar');
    const levelDisplay = document.getElementById('level');
    const xpDisplay = document.getElementById('xp');
    const xpBar = document.getElementById('xp-bar');
    const contractsList = document.getElementById('contracts-list');
    const storeList = document.getElementById('store-list');
    const feedbackLog = document.getElementById('feedback-log');
    const resetButton = document.getElementById('reset-button');
    // --- ¡NUEVAS REFERENCIAS! ---
    const passiveIncomeDisplay = document.getElementById('passive-income');
    const juniorDevsDisplay = document.getElementById('junior-devs');

    // --- Definiciones del Juego (se cargarán desde la API) ---
    let gameContracts = {};
    let gameStoreItems = {};
    let playerState = {};

    // --- Funciones de la API ---

    // 1. Carga el estado del jugador
    async function fetchGameState() {
        try {
            const response = await fetch('/api/get_game_state');
            if (!response.ok) {
                // Si el servidor falla, detenemos el bucle
                throw new Error('Error de red al cargar estado.');
            }
            
            const data = await response.json();
            playerState = data;
            updateUI(data);

        } catch (error) {
            console.error(error);
            logFeedback('Error de conexión con el servidor.');
            // Detener el bucle si hay un error
            if (gameLoopInterval) clearInterval(gameLoopInterval);
        }
    }

    // 2. Carga las definiciones (contratos y tienda)
    async function fetchDefinitions() {
        try {
            const response = await fetch('/api/get_definitions');
            if (!response.ok) throw new Error('Error de red al cargar definiciones.');

            const data = await response.json();
            gameContracts = data.contracts;
            gameStoreItems = data.store_items;
            
            renderContracts();
            renderStore();
        } catch (error) {
            console.error(error);
            logFeedback('Error cargando definiciones del juego.');
        }
    }

    // 3. Ejecuta un contrato
    async function doContract(contractId) {
        disableAllButtons(true);
        try {
            const response = await fetch('/api/do_contract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contract_id: contractId })
            });
            const data = await response.json();
            if (response.ok) {
                playerState = data.new_state;
                updateUI(playerState);
                logFeedback(`¡Contrato "${gameContracts[contractId].name}" completado!`);
            } else {
                logFeedback(`Error: ${data.error}`);
            }
        } catch (error) {
            logFeedback('Error de conexión al hacer contrato.');
        } finally {
            checkButtonStates();
        }
    }
    
    // 4. Compra un item
    async function buyItem(itemId) {
        if (!itemId) {
            logFeedback("Error: Intento de compra inválido.");
            return;
        }
        disableAllButtons(true);
        try {
            const response = await fetch('/api/buy_item', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item_id: itemId })
            });
            const data = await response.json();
            if (response.ok) {
                playerState = data.new_state;
                updateUI(playerState);
                logFeedback(`¡Compraste "${gameStoreItems[itemId].name}"!`);
            } else {
                logFeedback(`Error: ${data.error}`);
            }
        } catch (error) {
            logFeedback('Error de conexión al comprar.');
        } finally {
            checkButtonStates();
        }
    }

    // 5. Reinicia el juego
    async function resetGame() {
        if (!confirm('¿Estás seguro de que quieres reiniciar todo tu progreso? Esta acción no se puede deshacer.')) {
            return;
        }
        disableAllButtons(true);
        try {
            const response = await fetch('/api/reset_game', { method: 'POST' });
            const data = await response.json();
            if (response.ok) {
                playerState = data.new_state;
                renderStore(); 
                updateUI(playerState);
                logFeedback('¡Juego reiniciado! Has vuelto a empezar.');
            } else {
                logFeedback('Error: No se pudo reiniciar el juego.');
            }
        } catch (error) {
            logFeedback('Error de conexión al reiniciar.');
        } finally {
            checkButtonStates();
        }
    }

    // --- Funciones de UI (Renderizado) ---

    // 1. Actualiza todo el HUD
    function updateUI(data) {
        moneyDisplay.textContent = `$${data.money}`;
        energyDisplay.textContent = `${data.energy} / ${data.max_energy}`;
        levelDisplay.textContent = data.level;
        xpDisplay.textContent = `${data.xp} / ${data.xp_to_next_level}`;
        
        energyBar.style.width = `${(data.energy / data.max_energy) * 100}%`;
        xpBar.style.width = `${(data.xp / data.xp_to_next_level) * 100}%`;
        
        // --- ¡ACTUALIZAR NUEVOS CAMPOS! ---
        passiveIncomeDisplay.textContent = `($${data.passive_income} / seg)`;
        juniorDevsDisplay.textContent = data.junior_devs;
        
        checkButtonStates();
    }

    // 2. Dibuja los botones de contratos
    function renderContracts() {
        contractsList.innerHTML = '';
        for (const [id, contract] of Object.entries(gameContracts)) {
            contractsList.innerHTML += `
                <button class="action-button" id="contract-${id}" data-id="${id}">
                    ${contract.name}
                    <span class="button-description">
                        Costo: ${contract.energy_cost}⚡ | Recompensa: $${contract.money_reward}, ${contract.xp_reward}✨
                    </span>
                </button>
            `;
        }
        document.querySelectorAll('.action-button[data-id]').forEach(button => {
            if (button.id.startsWith('contract-')) {
                button.addEventListener('click', () => doContract(button.dataset.id));
            }
        });
    }

    // 3. Dibuja los botones de la tienda
    function renderStore() {
        storeList.innerHTML = '';
        for (const [id, item] of Object.entries(gameStoreItems)) {
            // Usamos el costo base para la primera dibujada
            const cost = item.cost || item.base_cost; 
            
            storeList.innerHTML += `
                <button class="action-button" id="store-${id}" data-item-id="${id}">
                    ${item.name}
                    <span class="button-description">
                        Costo: $${cost} | Efecto: ${item.effect_description}
                    </span>
                </button>
            `;
        }
        
        document.querySelectorAll('.action-button[data-item-id]').forEach(button => {
            button.addEventListener('click', () => buyItem(button.dataset.itemId));
        });
    }
    
    // 4. Habilita/Deshabilita botones según energía/dinero
    function checkButtonStates() {
        if (!playerState || typeof playerState.energy === 'undefined') return; 
        
        // Contratos (basado en energía)
        document.querySelectorAll('.action-button[data-id]').forEach(button => {
            const contract = gameContracts[button.dataset.id];
            if (contract) {
                button.disabled = playerState.energy < contract.energy_cost;
            }
        });
        
        // Tienda (basado en dinero)
        document.querySelectorAll('.action-button[data-item-id]').forEach(button => {
            const item = gameStoreItems[button.dataset.itemId];
            if (!item) return;

            // --- ¡NUEVA LÓGICA DE COSTO DINÁMICO! ---
            if (button.dataset.itemId === 'dev_junior') {
                // Costo dinámico: cost = base_cost * (1.15 ^ num_devs)
                const dynamicCost = Math.floor(item.base_cost * Math.pow(1.15, playerState.junior_devs));
                
                button.innerHTML = `
                    ${item.name} (${playerState.junior_devs} contratados)
                    <span class="button-description">
                        Costo: $${dynamicCost} | Efecto: ${item.effect_description}
                    </span>
                `;
                button.disabled = playerState.money < dynamicCost;
                return; // Saltar el resto de la lógica para este botón
            }
            
            // Lógica para items de un solo uso
            if (playerState.upgrades && playerState.upgrades.includes(button.dataset.id)) {
                 button.disabled = true;
                 button.textContent = `${item.name} (Comprado)`;
                 const span = button.querySelector('span');
                 if(span) span.style.display = 'none';
                 return;
            } else if (item.cost) { // Asegurarse de que no estamos sobreescribiendo el dev jr
                 button.innerHTML = `
                    ${item.name}
                    <span class="button-description">
                        Costo: $${item.cost} | Efecto: ${item.effect_description}
                    </span>
                 `;
                 button.disabled = playerState.money < item.cost;
            }
        });
    }
    
    function disableAllButtons(disabled) {
        document.querySelectorAll('.action-button').forEach(button => {
            if (button.textContent.includes('(Comprado)')) return;
            button.disabled = disabled;
        });
    }

    function logFeedback(message) {
        feedbackLog.innerHTML = message + '<br>' + feedbackLog.innerHTML;
    }

    // --- ¡NUEVO BUCLE DE JUEGO (GAME LOOP)! ---
    let gameLoopInterval;

    async function initialLoad() {
        await fetchDefinitions(); // Carga contratos/tienda (solo una vez)
        await fetchGameState();   // Carga el estado del jugador
        
        // Inicia el bucle automático (cada 5 segundos)
        gameLoopInterval = setInterval(fetchGameState, 5000);
    }

    resetButton.addEventListener('click', resetGame); 
    initialLoad(); // Inicia el juego
    
});