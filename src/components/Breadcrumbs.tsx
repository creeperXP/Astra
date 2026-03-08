import { useStore, type BreadcrumbItem } from '../store/useStore';
import { motion } from 'framer-motion';

export function Breadcrumbs() {
  const { breadcrumbs, setBreadcrumbs, setViewLevel, setLevel2Data, setSelectedNode, setSelectedPersonalSkill } = useStore();

  function goTo(item: BreadcrumbItem) {
    if (item.type === 'galaxy') {
      setViewLevel(1);
      setLevel2Data(null, null);
      setSelectedNode(null);
      setSelectedPersonalSkill(null);
      setBreadcrumbs([{ id: 'galaxy', name: 'Galaxy', type: 'galaxy' }]);
    } else if (item.type === 'course') {
      // Could be a personal skill (viewLevel 3) or a course (viewLevel 2)
      const isPersonal = item.id.startsWith('personal_');
      setViewLevel(isPersonal ? 3 : 2);
      setBreadcrumbs([{ id: 'galaxy', name: 'Galaxy', type: 'galaxy' }, item]);
    } else {
      const prev = breadcrumbs.slice(0, breadcrumbs.findIndex((b) => b.id === item.id) + 1);
      setBreadcrumbs(prev);
    }
  }

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {breadcrumbs.map((b, i) => (
        <span key={b.id} className="crumb-wrap">
          {i > 0 && <span className="crumb-sep">/</span>}
          <motion.button
            type="button"
            className={`crumb ${i === breadcrumbs.length - 1 ? 'active' : ''}`}
            onClick={() => goTo(b)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
          >
            {b.name}
          </motion.button>
        </span>
      ))}
    </nav>
  );
}
