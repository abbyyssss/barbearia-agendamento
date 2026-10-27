# Navalha & Co. – Sistema de agendamento online

Site de agendamento para uma barbearia fictícia. O cliente escolhe o serviço, o barbeiro, o dia e o horário em poucos cliques, e o responsável acompanha tudo em um painel.

🔗 **Demonstração:** https://abbyyssss.github.io/barbearia-agendamento/

> Projeto de portfólio. A barbearia, os nomes e os dados são fictícios.

<!-- Depois de publicar, adicione prints em docs/ e descomente as linhas abaixo:
![Tela de agendamento](docs/agendar.png)
![Painel do barbeiro](docs/painel.png)
-->

## 🎯 Objetivo

Praticar a construção de uma aplicação web completa, do desenho da interface às regras de negócio, com foco em uma experiência simples para quem agenda e clara para quem atende.

## ✨ Funcionalidades

**Para o cliente**
- Agendamento em 4 etapas: serviço, barbeiro, data e horário, dados pessoais
- Horários calculados pela duração de cada serviço
- Horários ocupados ou já passados ficam indisponíveis
- Validação de nome e celular, com máscara de telefone
- Resumo do pedido com valor total antes de confirmar

**Para o barbeiro (aba Painel)**
- Agendamentos de hoje, próximos horários e previsão de faturamento
- Lista em ordem cronológica
- Cancelamento com segunda confirmação, que libera o horário novamente

**Geral**
- Layout responsivo (celular e computador)
- Tema claro e escuro automático, conforme o sistema do usuário

## 🧠 Decisões técnicas

- **Sem sobreposição de horários:** dois agendamentos do mesmo barbeiro no mesmo dia só coexistem se um terminar antes de o outro começar. A regra considera a duração de cada serviço, não só o horário de início.
- **Revalidação ao confirmar:** antes de salvar, o sistema confere de novo se o horário continua livre.
- **Expediente por dia da semana:** sábado fecha mais cedo e domingo não abre.
- **Proteção contra HTML injetado:** os textos digitados pelo usuário são escapados antes de aparecer na tela.
- **Código separado por responsabilidade:** estrutura (HTML), visual (CSS) e lógica (JS) em arquivos próprios, e o JavaScript dividido em seções.

## 🛠️ Tecnologias

- HTML5, CSS3 e JavaScript puro (sem frameworks)
- `localStorage` para guardar os agendamentos no navegador
- GitHub Pages para hospedagem

## 📁 Estrutura

```
barbearia-agendamento/
├── index.html   # estrutura da página
├── style.css    # visual, responsividade e tema escuro
├── script.js    # regras de horários, validação e painel
└── README.md
```

## ▶️ Como rodar

1. Clone o repositório:
   ```bash
   git clone https://github.com/abbyyssss/barbearia-agendamento.git
   ```
2. Abra o arquivo `index.html` no navegador.

Não precisa instalar nada.

## 🗺️ Próximos passos

- [x] Separar o código em `index.html`, `style.css` e `script.js`
- [ ] Criar uma API (login e agendamentos) com banco de dados MySQL
- [ ] Autenticação para o painel do barbeiro
- [ ] Envio de lembrete ao cliente

## 👤 Autor

**Kauan Quaresma**
[LinkedIn](https://www.linkedin.com/in/kauan-quaresma-3a8ba5356/) · [GitHub](https://github.com/abbyyssss)