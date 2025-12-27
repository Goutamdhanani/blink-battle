import React from 'react';
import './ReactionLights.css';

type LightState = 'off' | 'red' | 'green';

interface ReactionLightsProps {
  state: LightState;
  countdown?: number | null;
}

/**
 * F1-style reaction lights component
 * Shows 5 lights that turn red during countdown, then green when it's time to react
 */
const ReactionLights: React.FC<ReactionLightsProps> = ({ state, countdown }) => {
  // Calculate how many lights should be lit based on countdown
  const lightsToShow = countdown !== null && countdown !== undefined ? 5 - countdown : 0;
  
  return (
    <div className="reaction-lights">
      {[...Array(5)].map((_, index) => {
        let lightClass = 'light';
        
        if (state === 'green') {
          // All lights green
          lightClass += ' light-green';
        } else if (state === 'red' && index < lightsToShow) {
          // Progressive red lights during countdown
          lightClass += ' light-red';
        }
        
        return (
          <div key={index} className={lightClass}>
            <div className="light-glow"></div>
          </div>
        );
      })}
    </div>
  );
};

export default ReactionLights;
