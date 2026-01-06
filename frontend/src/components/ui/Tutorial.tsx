import React, { useState, useEffect } from 'react';
import './Tutorial.css';

interface TutorialStep {
  title: string;
  description: string;
  icon?: string;
}

interface TutorialProps {
  steps: TutorialStep[];
  onComplete: () => void;
  onSkip?: () => void;
  storageKey: string; // Key to store completion in localStorage
}

const Tutorial: React.FC<TutorialProps> = ({ steps, onComplete, onSkip, storageKey }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Check if user has already completed this tutorial
    const hasCompleted = localStorage.getItem(`tutorial_${storageKey}`);
    if (hasCompleted === 'true') {
      setIsVisible(false);
      onComplete();
    }
  }, [storageKey, onComplete]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem(`tutorial_${storageKey}`, 'true');
    setIsVisible(false);
    onComplete();
  };

  const handleSkipTutorial = () => {
    localStorage.setItem(`tutorial_${storageKey}`, 'true');
    setIsVisible(false);
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  };

  if (!isVisible) {
    return null;
  }

  const step = steps[currentStep];

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-backdrop" onClick={(e) => e.stopPropagation()} />
      <div className="tutorial-container">
        <div className="tutorial-content">
          {/* Header */}
          <div className="tutorial-header">
            <h2 className="tutorial-title">
              {step.icon && <span className="tutorial-icon">{step.icon}</span>}
              {step.title}
            </h2>
            <button 
              className="tutorial-close-btn"
              onClick={handleSkipTutorial}
              aria-label="Skip tutorial"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="tutorial-body">
            <p className="tutorial-description">{step.description}</p>
          </div>

          {/* Progress Indicators */}
          <div className="tutorial-progress">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`progress-dot ${index === currentStep ? 'active' : ''} ${index < currentStep ? 'completed' : ''}`}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="tutorial-footer">
            <button
              className="tutorial-btn tutorial-btn-secondary"
              onClick={handleSkipTutorial}
            >
              Skip Tutorial
            </button>
            <div className="tutorial-nav-buttons">
              {currentStep > 0 && (
                <button
                  className="tutorial-btn tutorial-btn-outline"
                  onClick={handlePrevious}
                >
                  Previous
                </button>
              )}
              <button
                className="tutorial-btn tutorial-btn-primary"
                onClick={handleNext}
              >
                {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tutorial;
