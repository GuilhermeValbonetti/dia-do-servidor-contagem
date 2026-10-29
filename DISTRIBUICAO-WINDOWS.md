# Distribuir o Dia do Servidor no Windows

O pacote é destinado ao Windows de 64 bits. O computador que prepara o pacote precisa de internet; o computador que o executa não precisa ter Node.js ou .NET instalado. O backend é executado pelo `tsx` incluído no pacote para carregar o cliente Prisma gerado em TypeScript.

## Preparar o computador de build

Instale:

- Node.js 22.18 ou superior da linha 22, ou 24.12 ou superior. A versão 23 não é suportada.
- .NET SDK 8 ou superior.
- PowerShell 5.1 ou superior.

Confira as versões:

```powershell
node --version
npm.cmd --version
dotnet --version
```

O script baixa o runtime oficial do Node.js para Windows x64, confere o SHA-256 publicado pelo Node.js e o inclui no pacote. Ele também compila o inicializador como um `.exe` autocontido.

## Instalar dependências e gerar o pacote

No PowerShell, na raiz do repositório:

```powershell
cd C:\caminho\dia-do-servidor-contagem

cd server
npm.cmd ci
cd ..\frontend
npm.cmd ci
cd ..

Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\package-windows.ps1
```

O script compila o frontend, gera o cliente Prisma, compila a API e cria `release\DiaDoServidor`. Se essa pasta já existir, o script para para evitar sobrescrever arquivos. Para usar outro destino:

```powershell
.\scripts\package-windows.ps1 -OutputDirectory "C:\Pacotes\DiaDoServidor"
```

Mantenha juntos o `DiaDoServidor.exe`, a pasta `runtime`, a pasta `server` e a pasta `frontend`. Compacte a pasta completa para transferir a outro computador; não envie apenas o `.exe`.

## Primeiro uso e novos eventos

1. Extraia a pasta completa em um local permanente, por exemplo `%LOCALAPPDATA%\Programs\DiaDoServidor`.
2. Dê duplo clique em `DiaDoServidor.exe`. Na primeira inicialização, o programa aplica as migrações do banco, inicia a API, espera a confirmação de disponibilidade e abre o navegador.
3. O inicializador cria o atalho **Dia do Servidor** na área de trabalho.
4. Para iniciar novamente, use o atalho ou dê duplo clique no executável. Se o servidor já estiver funcionando, uma nova instância não é iniciada; o navegador é aberto.

O SQLite fica fora da pasta do programa em `%LOCALAPPDATA%\DiaDoServidor\data\sorteio.db`. Atualizar os arquivos do programa não substitui esse banco. Antes de trocar de versão, feche o navegador e encerre o processo Node do Dia do Servidor no Gerenciador de Tarefas. Faça uma cópia do banco antes de atualizar. Depois, substitua a pasta do programa sem alterar a pasta de dados; a nova versão aplica as migrações ao iniciar.

Fechar o navegador não encerra a API local. O servidor continua em segundo plano até o Windows ser desligado ou o processo Node ser encerrado. Se a porta local 8080 estiver ocupada, o inicializador informa que a API não ficou disponível; libere a porta ou altere a porta em conjunto com o inicializador antes de empacotar novamente.

## Operação e validação

O pacote trabalha na rede local e não precisa de internet após ser criado. A API escuta em `0.0.0.0`; outros computadores podem acessar a aplicação em `http://IP-DO-SERVIDOR:8080`. Todos os telões conectados ao mesmo backend acompanham a animação e a revelação pelo canal `/api/projection/events`, independentemente do navegador ou computador.

Teste o pacote extraído antes do evento:

- abra o atalho duas vezes e confirme que apenas uma API responde em `http://127.0.0.1:8080/api/health`;
- abra o painel e `/telao` em computadores diferentes conectados ao mesmo servidor e valide a animação e a revelação conjunta de um sorteio;
- confirme uma presença e crie um sorteio de teste;
- feche o navegador, abra novamente o atalho e confira que o serviço existente é reutilizado;
- confira se o banco permanece em `%LOCALAPPDATA%\DiaDoServidor\data` após substituir os arquivos do programa por uma cópia de atualização.

O pacote atual é x64 e não é assinado digitalmente. O Windows pode exibir um aviso do SmartScreen ao abrir o inicializador.

## Desenvolvimento local

O Vite encaminha `/api` para `http://127.0.0.1:8080` por padrão. Inicie os processos em dois terminais:

```powershell
cd server
npm.cmd run dev
```

```powershell
cd frontend
npm.cmd run dev
```

Abra `http://localhost:5173`. Para uma configuração diferente, defina `VITE_API_PROXY_TARGET` em `frontend/.env.local`.
