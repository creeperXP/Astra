import { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import { loadDemoData } from './data/loadGraph';
import { loadLevel1Graph } from './data/loadGraph';
import { loadSnapshot } from './lib/api';
import { saxophoneSkill } from './data/saxophoneSkill';
import { LandingPage } from './components/LandingPage';
import { OnboardingForm } from './components/OnboardingForm';
import { Breadcrumbs } from './components/Breadcrumbs';
import { ProfessionalApp } from './components/ProfessionalApp';
import { LeftSidebar } from './components/LeftSidebar';
import { GalaxyGraph } from './components/GalaxyGraph';
import { ConceptMap } from './components/ConceptMap';
import { NodePanel } from './components/NodePanel';
import { NodeDetailPanel } from './components/NodeDetailPanel';
import { PersonalSkillMap } from './components/PersonalSkillMap';
import './App.css';

function App() {
  const { appMode, onboardingComplete, viewLevel, setLevel1Data, setAppMode, setMasteryParams, addPersonalSkill, addCourseToGraph, addFolder, selectedPersonalSkill } = useStore();
  const graphContainerRef = useRef<HTMLDivElement | null>(null);

  // Always run hooks before any return (React rules of hooks)
  useEffect(() => {
    if (appMode !== 'student') return;
    addPersonalSkill(saxophoneSkill);
    loadDemoData()
      .then(() => Promise.all([loadLevel1Graph(), loadSnapshot()]))
      .then(([graphData, snap]) => {
        setLevel1Data(graphData);
        for (const [nodeId, { alpha, beta }] of Object.entries(snap.mastery ?? {})) {
          setMasteryParams(nodeId, alpha, beta);
        }
        const courseList = (snap.courses ?? []) as Array<{
          course_id: string; name: string; code: string; description?: string;
          dfw_rate?: number; institutional_success?: number; professor?: string;
          grade_distribution?: Record<string, number>;
          nebula_data?: unknown;
          reddit_summary?: string;
          professor_profile?: unknown;
          prereq_course_ids?: string[];
          concepts?: Array<{ id: string; name: string; deps: string[] }>;
        }>;
        for (const c of courseList) {
          addCourseToGraph({
            id: c.course_id,
            name: c.name,
            code: c.code,
            description: c.description,
            dfwRate: c.dfw_rate,
            institutionalSuccess: c.institutional_success,
            professor: c.professor,
            gradeDistribution: c.grade_distribution,
            nebulaData: c.nebula_data,
            redditSummary: c.reddit_summary,
            professorProfile: c.professor_profile,
            prereqCourseIds: c.prereq_course_ids,
          }, c.concepts ?? []);
        }
        for (const f of (snap.folders ?? []) as Array<{ folder_id: string; name: string; semester: string; course_ids: string[] }>) {
          addFolder(f.name, f.semester);
        }
      })
      .catch(() => {});
  }, [appMode, setLevel1Data, setMasteryParams, addCourseToGraph, addFolder, addPersonalSkill]); // eslint-disable-line react-hooks/exhaustive-deps

  if (appMode === null) return <LandingPage />;
  if (appMode === 'professional') return <ProfessionalApp />;

  if (!onboardingComplete) {
    return (
      <main className="app app-onboarding">
        <OnboardingForm />
      </main>
    );
  }

  return (
    <main className="app app-cortex">
      <header className="cortex-header">
        <h1 className="cortex-logo">Astra</h1>
        <span className="cortex-tagline"></span>
        <nav className="cortex-breadcrumbs">
          <Breadcrumbs />
        </nav>
        <button type="button" className="cortex-logout" onClick={() => setAppMode(null)} title="Back to login">
          Logout
        </button>
      </header>
      <div className="cortex-main">
        <aside className="cortex-left">
          <LeftSidebar />
        </aside>
        <section className="cortex-center" aria-label="Knowledge graph">
          <div ref={graphContainerRef} className="graph-fill-wrapper">
            {viewLevel === 1 && <GalaxyGraph containerRef={graphContainerRef} />}
            {viewLevel === 2 && <ConceptMap containerRef={graphContainerRef} />}
            {viewLevel === 3 && selectedPersonalSkill && <PersonalSkillMap skill={selectedPersonalSkill} containerRef={graphContainerRef} />}
          </div>
        </section>
      </div>
      <NodePanel />
      <NodeDetailPanel />
    </main>
  );
}

export default App;
