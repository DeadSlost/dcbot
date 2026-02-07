# Mythicmon Discord Bot - Guia de Configuracion

Bot de Discord que permite enviar notificaciones al Mythicmon Launcher
directamente desde Discord con comandos slash.

## Comandos Disponibles

| Comando | Descripcion |
|---------|-------------|
| `/notificar` | Enviar notificacion inmediata al launcher |
| `/programar` | Programar notificacion con temporizador (1 min - 7 dias) |
| `/notificaciones` | Ver todas las notificaciones actuales |
| `/borrar` | Borrar una notificacion por ID |
| `/pendientes` | Ver notificaciones programadas pendientes |
| `/cancelar` | Cancelar una notificacion programada |

### Tipos de notificacion
- 🚀 Actualizacion
- 🌟 Evento
- 🔧 Mantenimiento
- 💡 Consejo
- ⚠️ Aviso
- ℹ️ Info

---

## Paso 1: Crear el Bot en Discord

1. Ve a https://discord.com/developers/applications
2. Click en **"New Application"**
3. Nombre: `Mythicmon Bot` → Click **Create**
4. En la seccion **Bot** del menu lateral:
   - Click **"Reset Token"** → Copia el token (lo necesitaras luego)
   - Activa **"Message Content Intent"** (abajo en Privileged Gateway Intents)
5. En la seccion **OAuth2** del menu lateral:
   - En **OAuth2 URL Generator**, marca:
     - `bot`
     - `applications.commands`
   - En **Bot Permissions**, marca:
     - `Send Messages`
     - `Embed Links`
     - `Use Slash Commands`
   - Copia la URL generada abajo y abrela en el navegador
   - Selecciona tu servidor de Discord y autoriza el bot

## Paso 2: Obtener el Guild ID (ID del servidor)

1. En Discord, ve a **Ajustes de usuario** → **Avanzado** → Activa **Modo desarrollador**
2. Click derecho en el **nombre de tu servidor** (en la lista de servidores)
3. Click en **"Copiar ID del servidor"**
4. Ese es tu `GUILD_ID`

## Paso 3: Crear GitHub Personal Access Token

1. Ve a https://github.com/settings/tokens?type=beta
2. Click **"Generate new token"** (Fine-grained token)
3. Nombre: `Mythicmon Bot`
4. Expiracion: selecciona lo que quieras (o "No expiration" en classic tokens)
5. En **Repository access**: selecciona **"Only select repositories"** → escoge `DeadSlost/distro`
6. En **Permissions** → **Repository permissions**:
   - **Contents**: Read and Write
7. Click **Generate token** y copia el token

> **Alternativa rapida:** Si prefieres, puedes usar un Classic Token:
> 1. Ve a https://github.com/settings/tokens
> 2. **Generate new token (classic)**
> 3. Marca `repo` (Full control of private repositories)
> 4. Click **Generate token** y copialo

## Paso 4: Configurar el Bot

1. Abre la carpeta `discord-bot/`
2. Copia el archivo `.env.example` como `.env`:
   ```
   copy .env.example .env
   ```
3. Edita `.env` con tus valores:
   ```
   DISCORD_TOKEN=tu_token_del_bot_aqui
   GUILD_ID=tu_id_del_servidor_aqui
   GITHUB_TOKEN=tu_github_token_aqui
   ```

## Paso 5: Instalar y Ejecutar

```bash
cd discord-bot
npm install
npm start
```

Si ves `✅ Bot conectado como Mythicmon Bot#XXXX` y los comandos registrados, esta listo!

---

## Ejemplos de Uso

### Notificacion inmediata
```
/notificar titulo:Evento de Pokemon Legendarios mensaje:Este sabado habra un evento especial con spawns de Pokemon legendarios! tipo:evento
```

### Programar notificacion (en 30 minutos)
```
/programar titulo:Mantenimiento del Servidor mensaje:El servidor se reiniciara en 30 minutos. Guarda tu progreso! minutos:30 tipo:mantenimiento
```

### Ver notificaciones actuales
```
/notificaciones
```

### Borrar notificacion
```
/borrar id:discord-evento-de-pokemon-lxyz123
```

---

## Notas

- Solo los **Administradores** del servidor pueden usar los comandos
- Las notificaciones programadas se pierden si el bot se reinicia
- El launcher actualiza las notificaciones automaticamente cada vez que se abre
- Maximo 50 notificaciones almacenadas (las mas antiguas se borran automaticamente)
- Para mantener el bot encendido 24/7, puedes usar un VPS o servicio como Railway, Render, etc.
