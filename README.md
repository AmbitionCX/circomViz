# circomViz

- node version: v18.20.4
- pnpm version: 9.5.0

## Initial setup for Frontend
The frontend is built with **Vite + Vue3 + TypeScript + Element-Plus + Tailwind CSS**. To run the frontend, run the following command in the root directory of the project:

```shell
cd Frontend
pnpm install
pnpm run dev
```

## Initial setup for Backend

Install [circom](https://github.com/iden3/circom) before running the backend. You can download from [GitHub release page](https://github.com/iden3/circom/releases) (recommended), and make it executable by running:
```shell
chmod +x ./circom-linux-amd64
cp ./circom-linux-amd64 /usr/local/bin/circom
circom --version
```
Or build manually:
```shell
git clone https://github.com/iden3/circom.git
cargo build --release
cargo install --path circom
# install the circom binary in the directory $HOME/.cargo/bin
circom --version
```

The backend is built with **TypeScript + Fastify**. To run the backend, run the following command in the root directory of the project:
```shell
pnpm install
pnpm run build
pnpm run start
```