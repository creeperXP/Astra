import { useState } from 'react';
import { useStore } from '../store/useStore';

interface QuizQuestion { q: string; options: string[]; correct: number; difficulty?: number; explanation?: string }

/** Build 3 topic-specific questions from the course name/description (no API required). */
function buildFallbackQuiz(name: string, description?: string): QuizQuestion[] {
  const desc = description || name;
  const words = desc.replace(/[^a-zA-Z ]/g, ' ').split(/\s+/).filter((w) => w.length > 4);
  const topic = words[0] ?? name;
  return [
    {
      q: `Which of the following best describes the main focus of ${name}?`,
      options: [desc.slice(0, 60) + '…', 'Advanced calculus methods only', 'Network security protocols', 'Database management systems'],
      correct: 0,
      difficulty: 0.3,
      explanation: `${name} focuses on: ${desc.slice(0, 120)}.`,
    },
    {
      q: `What prerequisite knowledge is most directly applicable to ${topic}?`,
      options: ['Foundational math and logic', 'Artistic design principles', 'Physical hardware repair', 'Legal compliance frameworks'],
      correct: 0,
      difficulty: 0.5,
      explanation: 'Most STEM courses build on foundational mathematical and logical reasoning.',
    },
    {
      q: `A student with strong mastery of ${topic} would most likely be able to:`,
      options: [
        'Apply concepts to solve novel, real-world problems',
        'Only recite definitions from memory',
        'Avoid all topics related to the subject',
        'Rely entirely on external tools without understanding',
      ],
      correct: 0,
      difficulty: 0.7,
      explanation: 'True mastery means transferring knowledge to new contexts.',
    },
  ];
}
import { updateBeta, initialBetaFromPrior } from '../lib/bayesian';
import { NEBULA_PRIOR_SUCCESS } from '../lib/constants';
import { generateNodeContent, bayesianUpdate } from '../lib/api';
import { loadLevel2Graph } from '../data/loadGraph';
import { SpiderChart } from './SpiderChart';
import { motion, AnimatePresence } from 'framer-motion';

export function NodePanel() {
  const {
    selectedNode,
    setSelectedNode,
    selectedNodePosition,
    nodePanelOpen,
    setNodePanelOpen,
    getMastery,
    queueMasteryUpdate,
    flushMasteryUpdates,
    setLevel2Data,
    setViewLevel,
    setBreadcrumbs,
  } = useStore();
  const [quiz, setQuiz] = useState<{ questions: QuizQuestion[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answerResult, setAnswerResult] = useState<'correct' | 'wrong' | null>(null);

  const isOpen = !!(selectedNode && nodePanelOpen);

  const institutional = selectedNode?.institutionalSuccess ?? NEBULA_PRIOR_SUCCESS;
  const personalized = selectedNode ? getMastery(selectedNode.id) : NEBULA_PRIOR_SUCCESS;

  const handleClose = () => {
    flushMasteryUpdates();
    setNodePanelOpen(false);
    setSelectedNode(null);
    setQuiz(null);
    setAnswerResult(null);
    setCurrentQ(0);
  };

  const handleOpenConceptMap = () => {
    if (!selectedNode || selectedNode.type !== 'course') return;
    flushMasteryUpdates();
    const parentPos = selectedNodePosition ?? { x: 0, y: 0, z: 0 };
    const l2 = loadLevel2Graph(selectedNode, parentPos);
    setLevel2Data(l2, selectedNode.id);
    setViewLevel(2);
    setBreadcrumbs([
      { id: 'galaxy', name: 'Galaxy', type: 'galaxy' },
      { id: selectedNode.id, name: selectedNode.name, type: 'course' },
    ]);
    setNodePanelOpen(false);
    setSelectedNode(null);
    setQuiz(null);
  };

  const handleGenerateQuiz = async () => {
    if (!selectedNode) return;
    setLoading(true);
    try {
      const res = await generateNodeContent(selectedNode.id, 'Make quiz', {
        mastery: personalized,
        course_description: selectedNode.description,
      });
      if (res?.payload?.questions?.length) {
        setQuiz({ questions: res.payload.questions });
        return;
      }
    } catch {
      // backend unavailable – use local fallback
    } finally {
      setLoading(false);
    }
    // ── local fallback quiz built from course description ─────────────────
    setQuiz({ questions: buildFallbackQuiz(selectedNode.name, selectedNode.description) });
  };

  const handleAnswer = async (correctIndex: number, chosenIndex: number, difficulty: number) => {
    if (!selectedNode) return;
    const success = chosenIndex === correctIndex;
    setAnswerResult(success ? 'correct' : 'wrong');
    try {
      const res = await bayesianUpdate(selectedNode.id, success, difficulty);
      queueMasteryUpdate(selectedNode.id, res.alpha, res.beta);
    } catch {
      const { alpha, beta } = initialBetaFromPrior(personalized);
      const next = updateBeta(alpha, beta, success, difficulty);
      queueMasteryUpdate(selectedNode.id, next.alpha, next.beta);
    }
    const explanation = quiz?.questions[currentQ]?.explanation;
    setTimeout(() => {
      setAnswerResult(null);
      if (quiz && currentQ < quiz.questions.length - 1) {
        setCurrentQ((q) => q + 1);
      } else {
        setQuiz(null);
        setCurrentQ(0);
      }
    }, explanation ? 2000 : 1500);
  };

  return (
    <AnimatePresence>
      {isOpen && selectedNode && (
        <>
          <motion.div
            key="backdrop"
            className="node-panel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            key="panel"
            className="node-panel node-panel-sidebar"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="node-panel-header">
              <h2>{selectedNode.name}</h2>
              <button type="button" className="close-btn" onClick={handleClose} aria-label="Close">
                ×
              </button>
            </div>
            <div className="node-panel-body">
              <p className="node-type">{selectedNode.type === 'course' ? 'Course' : 'Concept'}</p>
              {selectedNode.isEstimatedConcept && (
                <p className="estimated-label">Estimated concepts (from description only)</p>
              )}
              <div className="dual-glow">
                <div className="glow-row">
                  <span>UTD average success</span>
                  <span>{(institutional * 100).toFixed(0)}%</span>
                </div>
                <div className="glow-row personalized">
                  <span>Your personalized</span>
                  <span>{(personalized * 100).toFixed(0)}%</span>
                </div>
              </div>
              {selectedNode.dfwRate != null && (
                <p>DFW rate: {(selectedNode.dfwRate * 100).toFixed(1)}%</p>
              )}
              <SpiderChart
                values={{
                  'Prereq mastery': Math.min(1, (personalized + 0.2)),
                  'Course DFW': 1 - (selectedNode.dfwRate ?? 0.2),
                  'Career fit': 0.7,
                  'Difficulty': 1 - (selectedNode.dfwRate ?? 0.2) * 1.2,
                }}
              />
              {selectedNode.description && <p className="description">{selectedNode.description}</p>}

              <div className="actions">
                <button type="button" onClick={handleGenerateQuiz} disabled={loading}>
                  {loading ? 'Generating…' : 'Generate quiz'}
                </button>
                {selectedNode.type === 'course' && (
                  <button type="button" onClick={handleOpenConceptMap}>
                    Open concept map
                  </button>
                )}
              </div>

              {quiz && quiz.questions.length > 0 && (() => {
                const q = quiz.questions[currentQ];
                const diff = q.difficulty ?? 0.5;
                return (
                  <div className="quiz-block">
                    <div className="quiz-progress">
                      <span>Question {currentQ + 1}/{quiz.questions.length}</span>
                      <span className="quiz-diff">Difficulty: {'★'.repeat(Math.round(diff * 3))}{'☆'.repeat(3 - Math.round(diff * 3))}</span>
                    </div>
                    <p className="quiz-q">{q.q}</p>
                    <div className="quiz-options">
                      {q.options.map((opt, i) => (
                        <button
                          key={i}
                          type="button"
                          className={answerResult !== null ? (i === q.correct ? 'quiz-correct' : answerResult === 'wrong' && i !== q.correct ? 'quiz-wrong-opt' : '') : ''}
                          onClick={() => handleAnswer(q.correct, i, diff)}
                          disabled={answerResult !== null}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                    {answerResult && (
                      <>
                        <p className={answerResult === 'correct' ? 'correct' : 'wrong'}>
                          {answerResult === 'correct' ? '✓ Correct!' : '✗ Incorrect.'}
                        </p>
                        {q.explanation && <p className="quiz-explanation">{q.explanation}</p>}
                      </>
                    )}
                  </div>
                );
              })()}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
