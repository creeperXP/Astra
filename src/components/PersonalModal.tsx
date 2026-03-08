import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store/useStore';
import { generatePersonalSkill, persistPersonalSkill } from '../lib/api';
import type { PersonalSkill } from '../types/personal';

interface Props { onClose: () => void }

type Step = 'form' | 'processing' | 'preview';

export function PersonalModal({ onClose }: Props) {
  const addPersonalSkill = useStore((s) => s.addPersonalSkill);

  const [step, setStep] = useState<Step>('form');
  const [skillName, setSkillName] = useState('');
  const [description, setDescription] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [links, setLinks] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [generatedSkill, setGeneratedSkill] = useState<PersonalSkill | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addLink = () => {
    const l = linkInput.trim();
    if (l && !links.includes(l)) { setLinks([...links, l]); setLinkInput(''); }
  };

  const handleGenerate = async () => {
    if (!skillName.trim()) { setError('Please enter a skill name.'); return; }
    setError('');
    setStep('processing');
    try {
      const res = await generatePersonalSkill(skillName.trim(), description.trim(), links);
      const skill: PersonalSkill = {
        skill_id: res.skill_id,
        name:     res.name,
        emoji:    res.emoji,
        description: res.description,
        nodes:    res.nodes as PersonalSkill['nodes'],
        links:    res.links as PersonalSkill['links'],
      };
      setGeneratedSkill(skill);
      setStep('preview');
    } catch {
      // fallback – minimal structure
      const slug = skillName.toLowerCase().replace(/\s+/g, '_');
      const fallback: PersonalSkill = {
        skill_id: `personal_${slug}_${Date.now()}`,
        name: skillName,
        emoji: '⭐',
        description,
        nodes: [
          { id: `${slug}_intro`,    name: `${skillName} Intro`,    description: `Get started with ${skillName}.`, deps: [],                  institutionalSuccess: 0.85, resources: [{ type: 'youtube', title: `Learn ${skillName}`, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(skillName)}+tutorial`, description: 'Tutorial series' }] },
          { id: `${slug}_practice`, name: 'Practice & Projects',   description: 'Build real projects to deepen your skills.',  deps: [`${slug}_intro`],   institutionalSuccess: 0.75, resources: [{ type: 'youtube', title: `${skillName} project`, url: `https://www.youtube.com/results?search_query=${encodeURIComponent(skillName)}+project+tutorial`, description: 'Hands-on practice' }] },
          { id: `${slug}_mastery`,  name: 'Mastery & Community',   description: 'Contribute to the community and refine your craft.', deps: [`${slug}_practice`], institutionalSuccess: 0.65, resources: [{ type: 'website', title: `${skillName} community`, url: `https://www.reddit.com/search/?q=${encodeURIComponent(skillName)}`, description: 'Community discussions' }] },
        ],
        links: [
          { source: `${slug}_intro`,    target: `${slug}_practice`, type: 'hard' },
          { source: `${slug}_practice`, target: `${slug}_mastery`,  type: 'hard' },
        ],
      };
      setGeneratedSkill(fallback);
      setStep('preview');
    }
  };

  const handleAdd = async () => {
    if (!generatedSkill) return;
    addPersonalSkill(generatedSkill);
    await persistPersonalSkill(generatedSkill as unknown as Record<string, unknown>);
    onClose();
  };

  const content = (
    <AnimatePresence>
      <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <div className="modal-center-wrap">
      <motion.div
        className="add-class-modal personal-modal"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: 'spring', damping: 22, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-icon">⭐</span>
            <h2>Add a Personal Skill</h2>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <AnimatePresence mode="wait">
            {step === 'form' && (
              <motion.div key="form" className="modal-step" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <h3>What do you want to learn?</h3>
                <p className="modal-hint">This can be anything — a hobby, craft, instrument, sport, or creative skill. Gemini will build a personalized skill-tree galaxy with free resources.</p>
                <label>
                  Skill Name <span className="req">*</span>
                  <input className="modal-input" type="text" placeholder="e.g. Sewing, Guitar, Watercolor, Cooking…"
                    value={skillName} onChange={(e) => setSkillName(e.target.value)} />
                </label>
                <label>
                  Description <span className="opt">(optional)</span>
                  <textarea className="modal-input" style={{ minHeight: 70, resize: 'vertical' }} placeholder="What's your goal? What level are you at?"
                    value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <label>
                  Resource Links <span className="opt">(optional)</span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input className="modal-input" type="url" placeholder="https://… (YouTube, book, website)"
                      value={linkInput} onChange={(e) => setLinkInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addLink()} style={{ flex: 1 }} />
                    <button className="btn-secondary" onClick={addLink} style={{ whiteSpace: 'nowrap' }}>+ Add</button>
                  </div>
                </label>
                {links.length > 0 && (
                  <div className="link-chips">
                    {links.map((l) => (
                      <span key={l} className="link-chip">
                        {l.slice(0, 40)}{l.length > 40 ? '…' : ''}
                        <button onClick={() => setLinks(links.filter((x) => x !== l))}>×</button>
                      </span>
                    ))}
                  </div>
                )}
                <input ref={fileRef} type="file" accept=".pdf" hidden />
                <button className="btn-secondary pdf-attach-btn" onClick={() => fileRef.current?.click()}>📎 Attach PDF (optional)</button>
                {error && <p className="modal-error">{error}</p>}
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={onClose}>Cancel</button>
                  <button className="btn-primary" onClick={handleGenerate}>✨ Generate Galaxy →</button>
                </div>
              </motion.div>
            )}

            {step === 'processing' && (
              <motion.div key="processing" className="modal-step processing-step" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="processing-orb" />
                <h3>Building "{skillName}" Galaxy…</h3>
                <p className="modal-hint">Gemini is generating your skill tree and finding the best free resources.</p>
                <div className="processing-list">
                  {['Analysing skill structure', 'Finding free resources', 'Building concept graph'].map((label, i) => (
                    <motion.div key={i} className="processing-item running"
                      initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.4 }}>
                      <span className="processing-icon"><span className="spin">◌</span></span>
                      <span>{label}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 'preview' && generatedSkill && (
              <motion.div key="preview" className="modal-step preview-step" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <h3>{generatedSkill.emoji} {generatedSkill.name}</h3>
                {generatedSkill.description && <p className="modal-hint">{generatedSkill.description}</p>}
                <div className="concept-section">
                  <h4>Skill Tree ({generatedSkill.nodes.length} nodes)</h4>
                  <div className="concept-preview">
                    {generatedSkill.nodes.map((n, i) => (
                      <motion.div key={n.id} className="concept-chip personal-chip"
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.06 }}>
                        <span className="concept-dot" style={{ background: '#a78bfa', boxShadow: '0 0 6px #a78bfa' }} />
                        <span>{n.name}</span>
                        {n.resources.length > 0 && (
                          <span className="concept-deps">🔗 {n.resources.length} resource{n.resources.length > 1 ? 's' : ''}</span>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
                <div className="resource-preview">
                  <h4>Sample Resources</h4>
                  {generatedSkill.nodes.slice(0, 2).flatMap((n) => n.resources.slice(0, 1)).map((r, i) => (
                    <div key={i} className="resource-row">
                      <span className="resource-type-icon">{r.type === 'youtube' ? '▶' : '🌐'}</span>
                      <div>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="resource-title">{r.title}</a>
                        {r.description && <p className="resource-desc">{r.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setStep('form')}>← Edit</button>
                  <button className="btn-primary pulse-btn" onClick={handleAdd}>🚀 Add to Galaxy</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
      </div>
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
