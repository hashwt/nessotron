# 🏦 Nessotron Bank

### Your Financial Future, Reimagined Through AI and Gaming

**An AI-powered, Pokémon-inspired financial wellness platform that makes financial planning, education, and decision-making interactive, immersive, and accessible.**

**Built for HackUTD 2026 | PNC 360° Financial Health Navigator Challenge**

---

## 🌟 Overview

Financial management shouldn't feel overwhelming.

Most people manage their finances across multiple accounts, credit cards, loans, and savings goals, yet traditional banking applications often present complex numbers without helping users understand their financial situation or what to do next.

**Nessotron Bank** reimagines financial wellness by combining conversational AI, gamification, and immersive visualization.

Instead of navigating a conventional banking dashboard, users enter a Pokémon-style virtual bank, interact with AI-powered financial assistants, explore financial concepts through a 3D universe, and visualize their future housing goals.

Our mission is to make financial education and planning something users can **experience, understand, and confidently act upon**.

## ✨ Key Features

### 🎮 Interactive Virtual Bank

Explore a Pokémon-inspired banking environment built using **Phaser.js**.

- Navigate a pixel-art virtual bank.
- Control animated characters using keyboard interactions.
- Interact with AI-powered financial assistants.
- Experience financial services through an engaging game interface.
- Access different financial experiences through conversational interactions.

### 👩‍💼 Finny — AI Financial Analyst

**Powered by NVIDIA Nemotron**

Finny is your personal AI financial planning companion.

- Discuss budgeting, income, expenses, and savings.
- Understand financial health and financial goals.
- Explore debt management and financial planning strategies.
- Ask questions about home affordability.
- Navigate to the AI-powered House Designer.

Finny focuses on helping users understand their financial situation and explore possible next steps.

### 👨‍🏫 Max — AI Financial Literacy Coach

**Powered by NVIDIA Nemotron**

Max makes financial concepts easier to understand through simple, conversational explanations.

Learn about:

- Compound interest and savings
- Credit scores and credit utilization
- Debt management
- Investing fundamentals
- Budgeting strategies
- Financial decision-making

Max also introduces users to **MoneyVerse**, where financial concepts become interactive experiences.

Users can ask Max to open MoneyVerse directly through conversation.

### 🌌 MoneyVerse — Learn Finance Through Gaming

MoneyVerse transforms financial education into an immersive 3D universe.

| Financial Concept | MoneyVerse Representation |
|---|---|
| Bank accounts | 🪐 Planets |
| Upcoming bills | ☄️ Asteroids |
| Debt | 🕳️ Black holes |
| Savings goals | 🌍 Worlds under construction |
| Financial decisions | 🎯 Interactive scenarios |

MoneyVerse is designed to help users explore financial situations, understand the consequences of their decisions, and develop financial confidence through practice.

Rather than simply reading financial advice, users can interact with financial concepts visually.

### 🏡 AI-Powered 3D House Designer

**Powered by Anthropic Claude and Three.js**

Our House Designer helps users visualize their future home.

- Enter housing preferences and requirements.
- Generate structured house layouts with AI.
- Visualize the resulting design in an interactive 3D environment.
- Explore room arrangements and different floors.
- Connect home design aspirations with financial planning conversations.

### 🎤 Conversational Interaction

Nessotron Bank supports natural-language conversations with its AI agents.

The dialogue interface supports typed questions, contextual responses, and action-based navigation. Browser speech recognition can also be used for voice input where enabled and supported.

---

## 🛠️ Tech Stack

| Category | Technologies |
|---|---|
| Frontend | HTML5, CSS3, JavaScript |
| Game Development | Phaser.js 3.70 |
| Backend | Node.js |
| Conversational AI | NVIDIA Nemotron |
| AI Integration | NVIDIA API, OpenAI-compatible SDK |
| Generative AI | Anthropic Claude |
| 3D House Visualization | Three.js |
| MoneyVerse | TypeScript, Vite |
| Voice Input | Web Speech API |
| Data Exchange | JSON, HTTP APIs |
| Development Tools | VS Code, npm, Git, GitHub |

## 🧠 System Architecture

```text
                     USER
                      |
                      v
             NESSOTRON BANK
        HTML + CSS + JavaScript
                 Phaser.js
                      |
                      v
                Node.js Server
                      |
             +--------+--------+
             |                 |
             v                 v
           FINNY              MAX
     Financial Analyst   Financial Coach
             |                 |
             +--------+--------+
                      |
                NVIDIA Nemotron
                      |
             +--------+--------+
             |                 |
             v                 v
       HOUSE DESIGNER       MONEYVERSE
             |                 |
       Anthropic Claude   TypeScript + Vite
             |
          Three.js
             |
       3D House Models
```

### How AI Integration Works

1. The user interacts with Finny or Max inside the virtual bank.
2. The frontend sends the user's message and recent conversation history to the Node.js backend.
3. The backend communicates with NVIDIA Nemotron.
4. The AI-generated response is returned to the frontend.
5. The dialogue interface displays the response.
6. If a supported navigation action is returned, the application opens the corresponding experience.

For example, when a user asks Max to open MoneyVerse, the backend can return:

```json
{
  "reply": "Awesome! Let's explore MoneyVerse!",
  "action": "open_moneyverse"
}
```

The frontend recognizes the action and redirects the user to MoneyVerse.

---

## 📁 Project Structure

```text
nessotron/
│
├── financial/
│   ├── agent.js
│   └── maxAgent.js
│
├── house/
│   ├── agent.js
│   └── rules.js
│
├── public/
│   ├── assets/
│   │
│   ├── house/
│   │   ├── app.js
│   │   └── house3d.js
│   │
│   ├── src/
│   │   ├── Character.js
│   │   ├── CharacterAnims.js
│   │   ├── Pathfinder.js
│   │   ├── Traffic.js
│   │   ├── GameScene.js
│   │   ├── CharacterPicker.js
│   │   ├── FinnDialogue.js
│   │   ├── MaxDialogue.js
│   │   ├── financialVoice.js
│   │   └── main.js
│   │
│   ├── welcome.html
│   ├── index.html
│   └── house.html
│
├── server.js
├── package.json
└── .env.example
```

MoneyVerse is developed as a separate Vite application and can be connected through its local or deployed URL.

## 🚀 Getting Started

### Prerequisites

Ensure the following are installed:

- Node.js and npm
- Git
- A modern browser, preferably Google Chrome
- NVIDIA API credentials
- Anthropic API credentials for the House Designer

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
cd YOUR_REPOSITORY
```

Replace the placeholders with your actual GitHub repository details.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root.

```env
NVIDIA_API_KEY=your_nvidia_api_key
NEMOTRON_MODEL=nvidia/nemotron-3.5-lightning-30b-a3b
ANTHROPIC_API_KEY=your_anthropic_api_key
PORT=8080
```

Ensure your server reads these environment variables and uses the corresponding API credentials.

**Security:** Never commit your actual `.env` file or API keys to GitHub. Add `.env` to `.gitignore` and provide `.env.example` with placeholders instead.

### 4. Start Nessotron Bank

```bash
node server.js
```

Open:

http://localhost:8080/

### 5. Start MoneyVerse

If MoneyVerse is in a separate repository, open that project in another terminal.

```bash
npm install
npm run dev -- --port 8081
```

Open:

http://localhost:8081/

Make sure the MoneyVerse URL in `MaxDialogue.js` points to the correct local or deployed application.

### 6. Explore the Platform

- Enter the virtual bank.
- Interact with Finny for financial planning.
- Ask Finny about housing goals and explore the House Designer.
- Interact with Max to learn financial concepts.
- Ask Max to open MoneyVerse.

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/financial-chat` | Communicate with Finny |
| POST | `/api/max-chat` | Communicate with Max |
| POST | `/api/design` | Generate AI-powered house designs |

### Example: Max Chat Request

```json
{
  "message": "Explain compound interest",
  "history": []
}
```

### Example: Max Chat Response

```json
{
  "reply": "Compound interest means earning interest on both your original savings and the interest you've already earned.",
  "action": null
}
```

---

## 🧩 Challenges We Faced

### Integrating Multiple AI Systems

We integrated NVIDIA Nemotron for conversational AI and Anthropic Claude for house generation, while maintaining separate responsibilities and consistent application behavior.

### Building a Game-Based Financial Interface

Combining Phaser.js character movement, animations, keyboard controls, and AI dialogue overlays required careful coordination.

### Connecting Independent Applications

Nessotron Bank, MoneyVerse, and the House Designer needed consistent navigation and communication despite using different technologies.

### AI-Driven 3D Visualization

Converting AI-generated house-layout information into meaningful 3D representations introduced challenges involving data structure, rendering, and user interaction.

### Hackathon Time Constraints

We had to prioritize core functionality, troubleshoot integration issues quickly, and coordinate development across multiple components.

---

## 🏆 Accomplishments

- Built an interactive Pokémon-inspired virtual banking environment.
- Integrated NVIDIA Nemotron into two specialized financial AI agents.
- Connected AI conversations with interactive application navigation.
- Developed an AI-powered 3D House Designer using Claude and Three.js.
- Created MoneyVerse, a gamified financial learning experience.
- Combined financial education, planning, and visualization in one platform.
- Built and integrated multiple technologies within a hackathon development cycle.

## 📚 What We Learned

Through Nessotron Bank, we gained practical experience in:

- Integrating large language models into full-stack applications.
- Designing specialized AI agents using system prompts.
- Building game interfaces with Phaser.js.
- Creating 3D visualizations with Three.js.
- Connecting multiple applications using JavaScript and HTTP APIs.
- Managing asynchronous AI responses and conversation state.
- Developing under tight deadlines while maintaining modular code.
- Designing financial experiences that prioritize accessibility and engagement.

## 🔮 Future Roadmap

- [ ] Secure integration with financial account data providers
- [ ] Unified financial health dashboard
- [ ] Cash-flow forecasting and financial obligation tracking
- [ ] Savings, debt, and spending health indicators
- [ ] Interactive what-if financial simulator
- [ ] Expanded AI-generated MoneyVerse scenarios
- [ ] Personalized financial learning journeys
- [ ] Improved voice conversations and accessibility
- [ ] User authentication and secure profile management
- [ ] Unified cloud deployment

## 🎯 Hackathon Challenge

**HackUTD 2026 — PNC 360° Financial Health Navigator**

The challenge asks how AI can help people see their complete financial picture, understand their financial situation, and feel confident about their next move.

Nessotron Bank approaches this challenge through:

1. **Conversational financial guidance** with Finny.
2. **Accessible financial education** with Max.
3. **Experiential learning** through MoneyVerse.
4. **AI-assisted goal visualization** through the 3D House Designer.

Our vision is to extend these experiences into a unified financial health platform that combines secure account data, forecasting, and personalized financial insights.

---

## 👥 Team

Built with passion during **HackUTD 2026**.

Add your team members and GitHub profiles here.

## 📄 License

Add a license file and update this section with the license selected for the repository.

---

### 💡 Our Vision

**Financial wellness shouldn't just be numbers on a screen. It should be an experience that helps people learn, explore, and make confident decisions.**

*Welcome to Nessotron Bank — where finance meets AI, gaming, and imagination.*
