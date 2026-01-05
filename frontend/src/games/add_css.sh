#!/bin/bash

# PathMemory.css
cat > PathMemory.css << 'EOF'
.path_memory-game {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.game-instructions, .game-complete {
  background: rgba(255, 255, 255, 0.95);
  border-radius: 20px;
  padding: 40px;
  max-width: 500px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;
}

.game-instructions h2, .game-complete h2 {
  font-size: 2.5em;
  margin: 0 0 10px 0;
}

.game-subtitle {
  color: #666;
  font-size: 1.2em;
  margin-bottom: 30px;
}

.instructions-content {
  text-align: left;
  margin: 30px 0;
  background: rgba(0, 0, 0, 0.05);
  padding: 20px;
  border-radius: 10px;
}

.instructions-content p {
  margin: 15px 0;
  font-size: 1.1em;
  color: #333;
}

.start-btn, .next-level-btn, .menu-btn {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 15px 40px;
  font-size: 1.2em;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: bold;
  margin: 10px;
}

.start-btn:hover, .next-level-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
}

.menu-btn {
  background: linear-gradient(135deg, #868e96, #495057);
}

.exit-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: white;
  border: 2px solid #ddd;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  font-size: 1.5em;
  cursor: pointer;
  transition: all 0.2s;
}

.exit-btn:hover {
  background: #ff6b6b;
  color: white;
  transform: rotate(90deg);
}

.game-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.95);
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  z-index: 1000;
}

.game-info {
  display: flex;
  justify-content: space-around;
  max-width: 600px;
  margin: 0 auto;
  font-weight: bold;
  font-size: 1.1em;
}

.game-arena {
  margin-top: 100px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
}

.instruction-text {
  font-size: 1.5em;
  font-weight: bold;
  color: white;
  margin-bottom: 30px;
  text-align: center;
}

.grid-container {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 15px;
  max-width: 400px;
  margin: 30px auto;
  padding: 20px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 20px;
}

.grid-cell {
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.9);
  border: 3px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  font-weight: bold;
  color: #667eea;
  position: relative;
}

.grid-cell:hover {
  background: rgba(255, 255, 255, 1);
  transform: scale(1.05);
}

.grid-cell.highlighted {
  background: linear-gradient(135deg, #51cf66, #40c057);
  border-color: #2f9e44;
  animation: pulse 0.5s;
  color: white;
}

.grid-cell.selected {
  background: linear-gradient(135deg, #667eea, #764ba2);
  border-color: #5f3dc4;
  color: white;
}

.path-number {
  position: absolute;
  font-size: 0.8em;
}

.path-progress {
  color: white;
  font-size: 1.2em;
  font-weight: bold;
  margin-top: 20px;
}

.feedback {
  font-size: 1.8em;
  font-weight: bold;
  margin: 30px 0;
  padding: 20px;
  border-radius: 15px;
  animation: feedbackPop 0.5s ease;
  color: white;
}

.feedback.correct {
  background: rgba(81, 207, 102, 0.3);
}

.feedback.wrong {
  background: rgba(255, 107, 107, 0.3);
}

@keyframes feedbackPop {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.1); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

.final-stats {
  display: flex;
  justify-content: space-around;
  margin: 30px 0;
  gap: 20px;
}

.stat-item {
  flex: 1;
  background: rgba(0, 0, 0, 0.05);
  padding: 20px;
  border-radius: 15px;
}

.stat-value {
  font-size: 2.5em;
  font-weight: bold;
  color: #667eea;
}

.stat-label {
  color: #666;
  margin-top: 5px;
}

.action-buttons {
  display: flex;
  justify-content: center;
  gap: 15px;
  flex-wrap: wrap;
}

@media (max-width: 768px) {
  .game-instructions h2, .game-complete h2 {
    font-size: 1.8em;
  }

  .game-instructions, .game-complete {
    padding: 20px;
  }

  .grid-container {
    max-width: 300px;
    gap: 10px;
    padding: 15px;
  }

  .grid-cell {
    font-size: 1.2em;
  }

  .game-arena {
    padding: 20px;
    margin-top: 80px;
  }

  .final-stats {
    flex-direction: column;
  }

  .stat-value {
    font-size: 2em;
  }
}

@media (max-width: 480px) {
  .game-info {
    font-size: 0.9em;
    flex-wrap: wrap;
    gap: 10px;
  }

  .grid-container {
    max-width: 250px;
    gap: 8px;
  }

  .grid-cell {
    font-size: 1em;
  }

  .instruction-text {
    font-size: 1.2em;
  }
}
EOF

echo "Created PathMemory.css"
