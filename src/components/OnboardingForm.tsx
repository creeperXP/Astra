import { useState } from 'react';
import type { OnboardingProfile, ExperienceLevel } from '../types/user';
import { useStore } from '../store/useStore';
import { motion } from 'framer-motion';

const SUBJECTS = ['Programming', 'Math', 'Data Structures', 'Statistics'];

export function OnboardingForm() {
  const { setProfile, setOnboardingComplete } = useStore();
  const [major, setMajor] = useState('CS');
  const [minor, setMinor] = useState('');
  const [gpaGoal, setGpaGoal] = useState(3.5);
  const [careerGoals, setCareerGoals] = useState('');
  const [experience, setExperience] = useState<Record<string, ExperienceLevel>>(
    Object.fromEntries(SUBJECTS.map((s) => [s, 3]))
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const profile: OnboardingProfile = {
      major,
      minor: minor || undefined,
      experienceBySubject: experience,
      gpaGoal,
      careerGoals,
    };
    setProfile(profile);
    setOnboardingComplete(true);
  }

  return (
    <motion.div
      className="onboarding-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="onboarding-card">
        <h1>Nebula Learning Galaxy</h1>
        <p className="subtitle">Set your profile for personalized mastery and recommendations.</p>
        <form onSubmit={handleSubmit}>
          <label>
            Major
            <input value={major} onChange={(e) => setMajor(e.target.value)} placeholder="e.g. CS" />
          </label>
          <label>
            Minor (optional)
            <input value={minor} onChange={(e) => setMinor(e.target.value)} placeholder="e.g. Math" />
          </label>
          <label>
            GPA Goal
            <input
              type="number"
              min={0}
              max={4}
              step={0.1}
              value={gpaGoal}
              onChange={(e) => setGpaGoal(Number(e.target.value))}
            />
          </label>
          <label>
            Career goals (short)
            <textarea
              value={careerGoals}
              onChange={(e) => setCareerGoals(e.target.value)}
              placeholder="e.g. Software engineer, ML research"
              rows={2}
            />
          </label>
          <fieldset>
            <legend>Experience level (1–5) per subject</legend>
            {SUBJECTS.map((s) => (
              <label key={s} className="exp-row">
                <span>{s}</span>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={experience[s] ?? 3}
                  onChange={(e) => setExperience((prev) => ({ ...prev, [s]: Number(e.target.value) as ExperienceLevel }))}
                />
                <span>{experience[s] ?? 3}</span>
              </label>
            ))}
          </fieldset>
          <button type="submit">Enter Galaxy</button>
        </form>
      </div>
    </motion.div>
  );
}
