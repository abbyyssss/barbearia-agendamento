# Navalha & Co. – Sistema de agendamento online

Sistema completo de agendamento para uma barbearia fictícia: site, API própria e banco de dados na nuvem. O cliente escolhe serviço, barbeiro, dia e horário, e o barbeiro acompanha tudo em um painel protegido por login.

🔗 **Demonstração:** https://abbyyssss.github.io/barbearia-agendamento/

> Projeto de portfólio. A barbearia e os dados são fictícios.
> A API roda em um plano gratuito de hospedagem: se ninguém usou o site por um tempo, a primeira abertura pode levar até cerca de 1 minuto para carregar os serviços. Depois disso, fica rápido.

<!-- Depois de adicionar os prints em docs/, descomente:
![Tela de agendamento](docs/agendar.png)
![Painel do barbeiro](docs/painel.png)
-->

## 🏗️ Arquitetura

```
Visitante → Site (GitHub Pages) → API (Render) → Banco MySQL (Aiven)
```

- **Este repositório:** o site (HTML, CSS e JavaScript).
- **[barbearia-api](https://github.com/abbyyssss/barbearia-api):** a API em Python e as regras de negócio.

## ✨ Funcionalidades

**Para o cliente**
- Agendamento em 4 etapas: serviço, barbeiro, data e horário, dados pessoais
- Só aparecem horários livres, calculados pela duração de cada serviço
- Validação de nome, celular (com máscara) e datas
- Resumo com valor total antes de confirmar

**Para o barbeiro (aba Painel)**
- Login com e-mail e senha
- Agendamentos de hoje, próximos horários e previsão de faturamento
- Cancelamento com segunda confirmação, que libera o horário

**Geral**
- Layout responsivo e tema claro/escuro automático
- Mensagens de erro claras quando a API não responde

## 🧠 Decisões técnicas

- **Regras no servidor:** datas passadas, domingos, expediente e conflitos de horário são validados na API, não só no navegador.
- **Sem horários duplicados:** a criação do agendamento usa transação com bloqueio por barbeiro, para que dois pedidos simultâneos não ocupem o mesmo horário.
- **Painel protegido:** login com token JWT e senhas guardadas com hash (bcrypt).
- **Segredos fora do código:** senha do banco e chave do token ficam em variáveis de ambiente.
- **Código organizado:** HTML, CSS e JavaScript separados, e o JavaScript dividido em seções por responsabilidade.

## 🛠️ Tecnologias

| Camada | Tecnologias | Hospedagem |
|---|---|---|
| Site | HTML5, CSS3, JavaScript puro | GitHub Pages |
| API | Python, FastAPI, SQLAlchemy | Render |
| Banco de dados | MySQL | Aiven |

## 📁 Estrutura

```
barbearia-agendamento/
├── index.html   # estrutura da página
├── style.css    # visual, responsividade e tema escuro
├── script.js    # comunicação com a API, horários e painel
└── README.md
```

## ▶️ Como rodar localmente

1. Suba a API seguindo o README do [barbearia-api](https://github.com/abbyyssss/barbearia-api).
2. Clone este repositório:
   ```bash
   git clone https://github.com/abbyyssss/barbearia-agendamento.git
   ```
3. Abra a pasta no VS Code e use a extensão **Live Server** no `index.html`. Em `127.0.0.1` ou `localhost`, o site usa a API local automaticamente.

## 🗺️ Próximos passos

- [x] Separar o código em `index.html`, `style.css` e `script.js`
- [x] Criar a API com banco de dados MySQL
- [x] Login para o painel do barbeiro
- [x] Publicar a API e o banco na nuvem
- [x] Testes automatizados das regras de horário
- [x] Cadastro de serviços e barbeiros pelo painel
- [x] Envio de lembrete ao cliente

## 👤 Autor

**Kauan Quaresma**
[LinkedIn](https://www.linkedin.com/in/kauan-quaresma-3a8ba5356/) · [GitHub](https://github.com/abbyyssss)
