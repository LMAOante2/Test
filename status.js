if (localStorage.getItem("status") === null) {
    localStorage.setItem("status", "true");
}

//--<Igraci>--//
const igraci = document.getElementById('igraci');

//--<Refresh>--//
let updateInterval = null;
let fetchInterval = null;

window.addEventListener('DOMContentLoaded', function () {
    const toggleState = localStorage.getItem('monitorToggle');
    if (toggleState === 'true') {
        document.getElementById('toggleMonitor').checked = true;
        document.getElementById('toggleMonitor').dispatchEvent(new Event('change'));
    }
});

document.getElementById('toggleMonitor').addEventListener('change', function () {
    localStorage.setItem('monitorToggle', this.checked);

    if (this.checked) {
        updateInterval = setInterval(() => updateServerStatus(currentServerId), 1000);
        fetchInterval = setInterval(() => fetchPlayers(currentServerId), 1000);
        const refresh = document.getElementById('refresh');
        refresh.style.display = 'none';
        const tekst = document.getElementById('tekst');
        tekst.style.color = 'green';
    } else {
        clearInterval(updateInterval);
        clearInterval(fetchInterval);
        const refresh = document.getElementById('refresh');
        refresh.style.display = 'inline';
        const tekst = document.getElementById('tekst');
        tekst.style.color = 'red';
    }
});

window.onload = () => {
    updateServerStatus(currentServerId);
    fetchPlayers(currentServerId);

    const refreshButton = document.getElementById("refresh");
    if (refreshButton) {
        refreshButton.onclick = refresh;
    }
};

function refresh() {
    fetchPlayers(currentServerId);
    updateServerStatus(currentServerId);
}

function zatvori() {
    cijelo.style.display = 'none';
    document.body.classList.remove('no-scroll');
    document.getElementById("kopirano").style.display = 'none';
}

function zatvoriesc() {
    let key = event.key;
    if (key == "Escape" || key == "Backspace") {
        cijelo.style.display = 'none';
        document.body.classList.remove('no-scroll');
        document.getElementById("kopirano").style.display = 'none';
    }
}

function igracIme() {
    const input = document.getElementById('searchInput').value.trim();
    const filter = input.toLowerCase();
    const cards = document.querySelectorAll('.igrac-kartica');

    cards.forEach(card => {
        const playerName = card.querySelector('.player-name').textContent.toLowerCase();
        if (playerName.includes(filter)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}


//--<Pretraga servera>--//
document.getElementById("searchInput1").addEventListener("keyup", function (event) {
    if (event.key === "Enter") {
        const inputValue = document.getElementById("searchInput1").value.trim();
        if (!inputValue) return;
        currentServerId = inputValue;
        loadCustomServer(currentServerId);
        updateServerStatus(currentServerId);
        fetchPlayers(currentServerId);
    }
});

//--<Server Status>--//
async function updateServerStatus(serverId) {
    try {
        const response = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${serverId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const serverData = await response.json();
        const playerCount = serverData?.Data?.players.length || 0;
        const serverName = serverData?.Data?.hostname || 'Unknown Server';
        const maxPlayers = serverData?.Data?.sv_maxclients || 2048;
        document.getElementById('serverName').innerText = `${serverName}`;
        document.getElementById('player-count').innerText = `${playerCount}/${maxPlayers}`;
        document.getElementById('server-status').innerHTML = "<span style='background: rgb(0,255,0);' class='pulse'></span><span style='color: rgb(0,255,0);'>Online</span>";
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('server-status').innerHTML = "<span class='pulse' style='background: red;'></span><span style='color: red;'>Offline</span>";
    }
}

async function fetchPlayers(serverId) {
    try {
        const response = await fetch(`https://servers-frontend.fivem.net/api/servers/single/${serverId}`);
        const data = await response.json();

        let igraclista = document.getElementById("igraclista");
        igraclista.innerHTML = "";

        if (data.Data && data.Data.players) {
            data.Data.players.forEach((player, index) => {
                let card = document.createElement("div");
                card.className = "igrac-kartica";
                card.innerHTML = `
                <h3 class="player-name">${player.name}</h3>
                <p><span class="igrac-number">#${index + 1}</span></p>
                <p class="igrac-id" data-id="${player.id}">ID: ${player.id}</p>
                `;
                igraclista.appendChild(card);
            });

            igraclista.onclick = function (e) {
                const target = e.target;

                if (target.classList.contains('player-name')) {
                    const playerName = target.textContent;
                    let ime = document.getElementById('ime');
                    let kopirano = document.getElementById('kopirano');
                    let cijelo = document.getElementById('cijelo');
                    navigator.clipboard.writeText(playerName).then(() => {
                        cijelo.style.display = 'block';
                        document.body.classList.add('no-scroll');
                        kopirano.style.display = 'block';
                        ime.innerHTML = `<i class="fa-solid fa-circle-info fa-flip infotxt"></i> Name "${playerName}" is successfully copied`;
                    });
                }

                if (target.classList.contains('igrac-id')) {
                    const igracid = target.getAttribute('data-id');
                    let ime = document.getElementById('ime');
                    let kopirano = document.getElementById('kopirano');
                    let cijelo = document.getElementById('cijelo');
                    navigator.clipboard.writeText(igracid).then(() => {
                        cijelo.style.display = 'block';
                        document.body.classList.add('no-scroll');
                        kopirano.style.display = 'block';
                        ime.innerHTML = `<i class="fa-solid fa-circle-info fa-flip infotxt"></i> ID "${igracid}" is successfully copied`;
                    });
                }
            };

        }
    } catch (error) {
        console.error("Error fetching player data:", error);
    }
}


//--<Ucitaj custom server>--//
async function loadCustomServer(serverId) {
    updateServerStatus(serverId);
    fetchPlayers(serverId);
}
