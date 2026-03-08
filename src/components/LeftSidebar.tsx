import { useState } from 'react';
import { useStore } from '../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';
import { AddClassModal } from './AddClassModal';
import { PersonalModal } from './PersonalModal';
import { saxophoneSkill } from '../data/saxophoneSkill';
import { persistFolder, deleteFolderApi, deleteCourseFromSnapshot } from '../lib/api';

const SEMESTERS = ['Spring 2025', 'Summer 2025', 'Fall 2025', 'Spring 2026', 'Summer 2026', 'Fall 2026'];

// ── Classes Tab ──────────────────────────────────────────────────────────────

function ClassesTab() {
  const {
    level1Data,
    userClasses,
    userTopics,
    addUserTopic,
    removeUserClass,
    removeCourseFromGraph,
    folders,
    addFolder,
    deleteFolder: storeDeleteFolder,
    addCourseToFolder,
    removeCourseFromFolder,
    setSelectedNode,
    setNodePanelOpen,
    setNodeDetailOpen,
    setBreadcrumbs,
  } = useStore();

  const courseNodes = level1Data?.nodes.filter((n) => n.type === 'course' && n.id !== 'quest_root') ?? [];
  const demoData = typeof window !== 'undefined'
    ? (window as unknown as { __demoData?: { concepts?: Record<string, { id: string; name: string }[]> } }).__demoData
    : undefined;
  const getCourseConcepts = (id: string) => demoData?.concepts?.[id] ?? [];

  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [addingTopicFor, setAddingTopicFor] = useState<string | null>(null);
  const [newTopicInput, setNewTopicInput] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderSem, setNewFolderSem] = useState(SEMESTERS[0]);
  const [draggedCourseId, setDraggedCourseId] = useState<string | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);

  const handleSelectCourse = (node: { id: string; name: string; type?: string; courseId?: string; [k: string]: unknown }) => {
    setSelectedNode({ ...node, type: (node.type ?? 'course') as 'course' | 'concept' } as Parameters<typeof setSelectedNode>[0]);
    setNodePanelOpen(true);
    setNodeDetailOpen(true);  // open the full NodeDetailPanel
    setBreadcrumbs([
      { id: 'galaxy', name: 'Galaxy', type: 'galaxy' },
      { id: node.id, name: node.name, type: 'course' },
    ]);
  };

  const handleAddTopic = (classId: string) => {
    const name = newTopicInput.trim();
    if (name) { addUserTopic(classId, name); setNewTopicInput(''); setAddingTopicFor(null); }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    addFolder(newFolderName.trim(), newFolderSem);
    const id = `folder_${Date.now()}`;
    await persistFolder({ folder_id: id, name: newFolderName.trim(), semester: newFolderSem, course_ids: [] });
    setNewFolderName(''); setShowNewFolder(false);
  };

  const handleDeleteFolder = async (id: string) => {
    storeDeleteFolder(id);
    await deleteFolderApi(id);
  };

  const handleDrop = (folderId: string) => {
    if (!draggedCourseId) return;
    addCourseToFolder(folderId, draggedCourseId);
    setDraggedCourseId(null);
    setDragOverFolderId(null);
  };

  // All course IDs that are in some folder
  const folderCourseIds = new Set(folders.flatMap((f) => f.courseIds));

  const renderCourseRow = (node: { id: string; name: string; type?: string; courseId?: string; topicIds?: string[]; semester?: string; [k: string]: unknown }, inFolder = false) => {
    const concepts = getCourseConcepts(node.id);
    const hasConc = concepts.length > 0;
    return (
      <div
        key={node.id}
        className={`folder-block ${inFolder ? 'in-folder' : ''}`}
        draggable
        onDragStart={() => setDraggedCourseId(node.id)}
        onDragEnd={() => setDraggedCourseId(null)}
      >
        <div className="folder-row">
          <button className="drag-handle" aria-label="drag">⠿</button>
          <button
            type="button"
            className="folder-toggle"
            onClick={() => hasConc && setExpandedCourses((prev) => {
              const s = new Set(prev); s.has(node.id) ? s.delete(node.id) : s.add(node.id); return s;
            })}
            disabled={!hasConc}
          >
            {hasConc ? (expandedCourses.has(node.id) ? '▼' : '▶') : '·'}
          </button>
          <button type="button" className="folder-label" onClick={() => handleSelectCourse(node)}>
            {node.name as string}
          </button>
          <button className="folder-delete-btn" title="Remove class"
            onClick={(e) => { e.stopPropagation(); removeCourseFromGraph(node.id); deleteCourseFromSnapshot(node.id); }}>×</button>
        </div>
        <AnimatePresence>
          {hasConc && expandedCourses.has(node.id) && (
            <motion.div className="folder-children"
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              {concepts.map((con) => (
                <div key={con.id} className="topic-row">
                  <span className="topic-dot">·</span>
                  <button type="button" className="topic-label"
                    onClick={() => { setSelectedNode({ id: con.id, name: con.name, type: 'concept', courseId: (node.courseId ?? node.id) as string }); setNodePanelOpen(true); }}>
                    {con.name}
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <div className="sidebar-tab-content">
      {/* Folders */}
      {folders.map((folder) => (
        <div key={folder.id}
          className={`sidebar-folder ${dragOverFolderId === folder.id ? 'drag-over' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverFolderId(folder.id); }}
          onDragLeave={() => setDragOverFolderId(null)}
          onDrop={() => handleDrop(folder.id)}
        >
          <div className="sidebar-folder-header">
            <button className="folder-toggle" onClick={() =>
              setExpandedFolders((prev) => { const s = new Set(prev); s.has(folder.id) ? s.delete(folder.id) : s.add(folder.id); return s; })}>
              {expandedFolders.has(folder.id) ? '▼' : '▶'}
            </button>
            <span className="sidebar-folder-name">📁 {folder.name}</span>
            {folder.semester && <span className="folder-semester-tag">{folder.semester}</span>}
            <button className="folder-delete-btn" onClick={() => handleDeleteFolder(folder.id)} title="Delete folder">×</button>
          </div>
          <AnimatePresence>
            {expandedFolders.has(folder.id) && (
              <motion.div className="folder-children"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                {folder.courseIds.map((cid) => {
                  const n = (courseNodes.find((c) => c.id === cid) as typeof courseNodes[0] | undefined)
                    ?? userClasses.find((c) => c.id === cid);
                  return n ? (
                    <div key={cid} className="folder-row">
                      {renderCourseRow(n as { id: string; name: string; type?: string; courseId?: string; [k: string]: unknown }, true)}
                      <button className="remove-from-folder" onClick={() => removeCourseFromFolder(folder.id, cid)} title="Remove from folder">↩</button>
                    </div>
                  ) : null;
                })}
                {folder.courseIds.length === 0 && (
                  <p className="folder-empty">Drop classes here</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}

      {/* Unfiled courses */}
      <div className="sidebar-section-label">
        {folders.length > 0 ? 'Unfiled' : 'All Classes'}
        <span className="sidebar-count">{courseNodes.filter((n) => !folderCourseIds.has(n.id)).length + userClasses.filter((c) => !folderCourseIds.has(c.id)).length}</span>
      </div>
      {courseNodes.filter((n) => !folderCourseIds.has(n.id)).map((n) => renderCourseRow(n as { id: string; name: string; type?: string; courseId?: string; [k: string]: unknown }))}
      {userClasses.filter((c) => !folderCourseIds.has(c.id)).map((c) => (
        <div key={c.id} className="folder-block" draggable onDragStart={() => setDraggedCourseId(c.id)} onDragEnd={() => setDraggedCourseId(null)}>
          <div className="folder-row">
            <button className="drag-handle">⠿</button>
            <button className="folder-toggle" onClick={() => setExpandedCourses((prev) => { const s = new Set(prev); s.has(c.id) ? s.delete(c.id) : s.add(c.id); return s; })}>
              {expandedCourses.has(c.id) ? '▼' : '▶'}
            </button>
            <button type="button" className="folder-label"
              onClick={() => { setSelectedNode({ id: c.id, name: c.name, type: 'course', courseId: c.id }); setNodePanelOpen(true); }}>
              {c.name}{c.semester ? <span className="folder-semester-tag" style={{marginLeft:'0.4rem'}}>{c.semester}</span> : ''}
            </button>
            <button className="folder-delete-btn" title="Remove class"
              onClick={(e) => { e.stopPropagation(); removeUserClass(c.id); }}>×</button>
          </div>
          <AnimatePresence>
            {expandedCourses.has(c.id) && (
              <motion.div className="folder-children"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                {c.topicIds.map((tid) => {
                  const topic = userTopics[tid];
                  return topic ? (
                    <div key={tid} className="topic-row">
                      <span className="topic-dot">·</span>
                      <button type="button" className="topic-label"
                        onClick={() => { setSelectedNode({ id: tid, name: topic.name, type: 'concept', courseId: c.id }); setNodePanelOpen(true); }}>
                        {topic.name}
                      </button>
                    </div>
                  ) : null;
                })}
                {addingTopicFor === c.id ? (
                  <div className="add-topic-inline">
                    <input type="text" value={newTopicInput}
                      onChange={(e) => setNewTopicInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddTopic(c.id); if (e.key === 'Escape') setAddingTopicFor(null); }}
                      placeholder="Topic name" autoFocus />
                    <button type="button" onClick={() => handleAddTopic(c.id)}>Add</button>
                    <button type="button" onClick={() => setAddingTopicFor(null)}>✕</button>
                  </div>
                ) : (
                  <button type="button" className="add-topic-btn" onClick={() => setAddingTopicFor(c.id)}>+ Add topic</button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}

      {/* Actions */}
      <div className="sidebar-tab-actions">
        {showNewFolder ? (
          <div className="new-folder-form">
            <input className="modal-input" type="text" placeholder="Folder name" value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)} autoFocus />
            <select className="modal-input" value={newFolderSem} onChange={(e) => setNewFolderSem(e.target.value)}>
              {SEMESTERS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowNewFolder(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreateFolder}>Create</button>
            </div>
          </div>
        ) : (
          <button type="button" className="cortex-btn folder-btn" onClick={() => setShowNewFolder(true)}>
            📁 New Folder
          </button>
        )}
        <button type="button" className="cortex-btn add-class-main-btn" onClick={() => setShowAddModal(true)}>
          + ADD CLASS
        </button>
      </div>

      {showAddModal && <AddClassModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

// ── Personal Tab ─────────────────────────────────────────────────────────────

function PersonalTab() {
  const { personalSkills, addPersonalSkill, removePersonalSkill, setSelectedPersonalSkill, setViewLevel, setBreadcrumbs } = useStore();
  const [showModal, setShowModal] = useState(false);

  // Pre-load saxophone if not already present
  const hasSax = personalSkills.some((s) => s.skill_id === saxophoneSkill.skill_id);

  const handleAddSax = () => {
    addPersonalSkill(saxophoneSkill);
  };

  return (
    <div className="sidebar-tab-content">
      {personalSkills.length === 0 && (
        <div className="personal-empty">
          <p>No personal skills yet.</p>
          {!hasSax && (
            <button className="btn-secondary" onClick={handleAddSax}>
              🎷 Try Saxophone (demo)
            </button>
          )}
        </div>
      )}
      {personalSkills.map((skill) => (
        <div key={skill.skill_id} className="personal-skill-row">
          <button className="personal-skill-btn" onClick={() => {
            setSelectedPersonalSkill(skill);
            setViewLevel(3);
            setBreadcrumbs([
              { id: 'galaxy', name: 'Galaxy', type: 'galaxy' },
              { id: skill.skill_id, name: `${skill.emoji} ${skill.name}`, type: 'course' },
            ]);
          }}>
            <span className="skill-emoji">{skill.emoji}</span>
            <span className="skill-name">{skill.name}</span>
            <span className="skill-node-count">{skill.nodes.length} nodes</span>
          </button>
          <button className="skill-remove-btn" onClick={() => removePersonalSkill(skill.skill_id)} title="Remove">×</button>
        </div>
      ))}
      {!hasSax && personalSkills.length > 0 && (
        <button className="btn-secondary sax-demo-btn" onClick={handleAddSax}>🎷 Add Saxophone (demo)</button>
      )}
      <div className="sidebar-tab-actions">
        <button type="button" className="cortex-btn add-class-main-btn" onClick={() => setShowModal(true)}>
          + ADD SKILL
        </button>
      </div>
      {showModal && <PersonalModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

// ── Main Sidebar ─────────────────────────────────────────────────────────────

export function LeftSidebar() {
  const { sidebarTab, setSidebarTab, level1Data, personalSkills } = useStore();
  const courseCount = (level1Data?.nodes.filter((n) => n.type === 'course' && n.id !== 'quest_root').length ?? 0);

  return (
    <div className="left-sidebar cortex-panel">
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab-btn ${sidebarTab === 'classes' ? 'active' : ''}`}
          onClick={() => setSidebarTab('classes')}
        >
          Classes
          <span className="tab-count">{courseCount}</span>
        </button>
        <button
          className={`sidebar-tab-btn ${sidebarTab === 'personal' ? 'active' : ''}`}
          onClick={() => setSidebarTab('personal')}
        >
          Personal
          <span className="tab-count">{personalSkills.length}</span>
        </button>
      </div>

      <div className="sidebar-log sidebar-log-scroll">
        <AnimatePresence mode="wait">
          {sidebarTab === 'classes' ? (
            <motion.div key="classes" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <ClassesTab />
            </motion.div>
          ) : (
            <motion.div key="personal" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
              <PersonalTab />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
