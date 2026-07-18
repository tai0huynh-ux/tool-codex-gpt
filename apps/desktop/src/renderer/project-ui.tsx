import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import type { ProjectView, RepositoryInput, RepositoryPreview } from '../project-ipc';
import { WorkflowWorkspace } from './workflow-ui';

const evidenceLabels: Record<string, string> = {
  'git-remote': 'Git remote',
  'repo-root': 'Thư mục gốc',
  'project-name': 'Tên project',
  'repository-marker': 'Dấu nhận diện',
  'agents-hash': 'AGENTS.md',
};

function errorMessage(response: { error: { message: string } }): string {
  return response.error.message;
}

function optionalValue(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function buildRepositoryInput(fields: {
  repoRoot: string;
  gitRemote: string;
  branch: string;
  projectName: string;
  worktreeRoot: string;
}): RepositoryInput {
  const gitRemote = optionalValue(fields.gitRemote);
  const branch = optionalValue(fields.branch);
  const projectName = optionalValue(fields.projectName);
  const worktreeRoot = optionalValue(fields.worktreeRoot);
  return {
    repoRoot: fields.repoRoot.trim(),
    ...(gitRemote ? { gitRemote } : {}),
    ...(branch ? { branch } : {}),
    ...(projectName ? { projectName } : {}),
    ...(worktreeRoot ? { worktreeRoot } : {}),
  };
}

export function App(): React.JSX.Element {
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [mappingProjectId, setMappingProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [alias, setAlias] = useState('');
  const [repoRoot, setRepoRoot] = useState('');
  const [gitRemote, setGitRemote] = useState('');
  const [branch, setBranch] = useState('');
  const [projectName, setProjectName] = useState('');
  const [worktreeRoot, setWorktreeRoot] = useState('');
  const [preview, setPreview] = useState<RepositoryPreview>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Đang đọc dữ liệu project…');

  const selectedProject = useMemo(
    () => projects.find((item) => item.project.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const replaceProject = (project: ProjectView): void => {
    setProjects((current) => {
      const remaining = current.filter((item) => item.project.id !== project.project.id);
      return project.project.archivedAt ? remaining : [...remaining, project];
    });
  };

  useEffect(() => {
    void window.contextBridgeDesktop.listProjects().then((response) => {
      if (!response.ok) {
        setNotice(errorMessage(response));
        return;
      }
      setProjects(response.value);
      const firstId = response.value[0]?.project.id ?? '';
      setSelectedProjectId(firstId);
      setMappingProjectId(firstId);
      setNotice(
        response.value.length === 0
          ? 'Chưa có project. Tạo project đầu tiên để bắt đầu.'
          : 'Dữ liệu được lưu cục bộ trên máy này.',
      );
    });
  }, []);

  const repository = (): RepositoryInput =>
    buildRepositoryInput({ repoRoot, gitRemote, branch, projectName, worktreeRoot });

  const createProject = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!newProjectName.trim()) return;
    setBusy(true);
    const response = await window.contextBridgeDesktop.createProject(newProjectName.trim());
    setBusy(false);
    if (!response.ok) {
      setNotice(errorMessage(response));
      return;
    }
    replaceProject(response.value);
    setSelectedProjectId(response.value.project.id);
    setMappingProjectId(response.value.project.id);
    setNewProjectName('');
    setNotice(`Đã tạo project “${response.value.project.name}”.`);
  };

  const chooseRoot = async (): Promise<void> => {
    const response = await window.contextBridgeDesktop.chooseRepositoryRoot();
    if (!response.ok) {
      setNotice(errorMessage(response));
      return;
    }
    if (response.value) {
      setRepoRoot(response.value);
      setWorktreeRoot(response.value);
      setPreview(undefined);
    }
  };

  const previewRepository = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!repoRoot.trim()) {
      setNotice('Hãy chọn hoặc nhập thư mục repository trước.');
      return;
    }
    setBusy(true);
    const response = await window.contextBridgeDesktop.previewRepository(repository());
    setBusy(false);
    if (!response.ok) {
      setNotice(errorMessage(response));
      return;
    }
    setPreview(response.value);
    const detectedId = response.value.detection.projectId;
    if (detectedId && !response.value.detection.requiresConfirmation) {
      setMappingProjectId(detectedId);
    } else if (!mappingProjectId) {
      setMappingProjectId(selectedProjectId);
    }
    setNotice(
      response.value.detection.requiresConfirmation
        ? 'Cần bạn xác nhận project đích trước khi ghi nhớ mapping.'
        : 'Đã phân tích bằng chứng. Hãy kiểm tra trước khi đăng ký.',
    );
  };

  const confirmRepository = async (): Promise<void> => {
    if (!preview || !mappingProjectId) return;
    setBusy(true);
    const response = await window.contextBridgeDesktop.confirmRepository(
      mappingProjectId,
      repository(),
    );
    setBusy(false);
    if (!response.ok) {
      setNotice(errorMessage(response));
      return;
    }
    replaceProject(response.value);
    setSelectedProjectId(response.value.project.id);
    setPreview(undefined);
    setNotice('Repository đã được đăng ký và bằng chứng mapping đã được lưu.');
  };

  const addAlias = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selectedProject || !alias.trim()) return;
    const response = await window.contextBridgeDesktop.addProjectAlias(
      selectedProject.project.id,
      alias.trim(),
    );
    if (!response.ok) {
      setNotice(errorMessage(response));
      return;
    }
    replaceProject(response.value);
    setAlias('');
    setNotice('Đã thêm bí danh project.');
  };

  const archiveProject = async (): Promise<void> => {
    if (!selectedProject) return;
    if (!window.confirm(`Lưu trữ project “${selectedProject.project.name}”?`)) return;
    const response = await window.contextBridgeDesktop.archiveProject(selectedProject.project.id);
    if (!response.ok) {
      setNotice(errorMessage(response));
      return;
    }
    replaceProject(response.value);
    const nextId = projects.find((item) => item.project.id !== selectedProject.project.id)?.project
      .id;
    setSelectedProjectId(nextId ?? '');
    setMappingProjectId(nextId ?? '');
    setNotice('Project đã được lưu trữ; dữ liệu không bị xoá.');
  };

  const confidence = preview ? Math.round(preview.detection.confidence * 100) : 0;

  return (
    <main className="workspace-shell">
      <header className="masthead">
        <div>
          <p className="eyebrow">CODEX CONTEXT BRIDGE / PROJECT MAP</p>
          <h1>
            Đặt đúng ngữ cảnh,
            <br />
            trước khi gửi đi.
          </h1>
        </div>
        <div className="mode-card">
          <span className="status-dot" aria-hidden="true" />
          <strong>Assisted mode</strong>
          <small>Không tự động gửi dữ liệu</small>
        </div>
      </header>

      <p className="notice" role="status">
        {notice}
      </p>

      {selectedProject && <WorkflowWorkspace projectId={selectedProject.project.id} />}

      <div className="workspace-grid">
        <aside className="project-rail" aria-label="Danh sách project">
          <div className="section-heading">
            <span>01</span>
            <h2>Projects</h2>
            <b>{projects.length}</b>
          </div>
          <form className="create-project" onSubmit={(event) => void createProject(event)}>
            <input
              aria-label="Tên project mới"
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              placeholder="Tên project mới"
            />
            <button type="submit" disabled={busy || !newProjectName.trim()}>
              Tạo
            </button>
          </form>
          <div className="project-list">
            {projects.map((item, index) => (
              <button
                className={
                  item.project.id === selectedProjectId ? 'project-item active' : 'project-item'
                }
                key={item.project.id}
                type="button"
                onClick={() => {
                  setSelectedProjectId(item.project.id);
                  setMappingProjectId(item.project.id);
                }}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{item.project.name}</strong>
                <small>{item.repositories.length} repo</small>
              </button>
            ))}
            {projects.length === 0 && <p className="empty-state">Danh sách đang trống.</p>}
          </div>
        </aside>

        <section className="mapping-panel">
          <div className="section-heading">
            <span>02</span>
            <h2>Repository mapping</h2>
          </div>
          <form className="repository-form" onSubmit={(event) => void previewRepository(event)}>
            <label className="field field-wide">
              <span>Repository root *</span>
              <div className="input-action">
                <input
                  value={repoRoot}
                  onChange={(event) => setRepoRoot(event.target.value)}
                  placeholder="C:\\work\\project"
                />
                <button type="button" onClick={() => void chooseRoot()}>
                  Chọn thư mục
                </button>
              </div>
            </label>
            <label className="field field-wide">
              <span>Git remote</span>
              <input
                value={gitRemote}
                onChange={(event) => setGitRemote(event.target.value)}
                placeholder="https://github.com/org/repo.git"
              />
            </label>
            <label className="field">
              <span>Branch</span>
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                placeholder="main"
              />
            </label>
            <label className="field">
              <span>Project name</span>
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                placeholder="package.json name"
              />
            </label>
            <label className="field field-wide">
              <span>Worktree root</span>
              <input
                value={worktreeRoot}
                onChange={(event) => setWorktreeRoot(event.target.value)}
                placeholder="Mặc định giống repository root"
              />
            </label>
            <button className="primary-action" type="submit" disabled={busy || !repoRoot.trim()}>
              {busy ? 'Đang kiểm tra…' : 'Phân tích repository'}
            </button>
          </form>

          {preview && (
            <div className="preview-card">
              <div className="confidence-block">
                <span>Độ tin cậy</span>
                <strong>{confidence}%</strong>
                <div className="confidence-track">
                  <i style={{ width: `${String(confidence)}%` }} />
                </div>
              </div>
              <div>
                <p className="preview-label">
                  {preview.detection.requiresConfirmation
                    ? 'Xác nhận thủ công bắt buộc'
                    : 'Ứng viên phù hợp'}
                </p>
                <div className="candidate-grid">
                  {preview.candidateProjects.map((candidate) => (
                    <button
                      className={
                        candidate.id === mappingProjectId ? 'candidate active' : 'candidate'
                      }
                      key={candidate.id}
                      type="button"
                      onClick={() => setMappingProjectId(candidate.id)}
                    >
                      <span>{candidate.id === mappingProjectId ? '●' : '○'}</span>
                      {candidate.name}
                    </button>
                  ))}
                </div>
                <ul className="evidence-list">
                  {preview.detection.evidence.map((item) => (
                    <li key={`${item.type}:${item.value}`}>
                      <span>{evidenceLabels[item.type] ?? item.type}</span>
                      <b>+{String(Math.round(item.score * 100))}%</b>
                    </li>
                  ))}
                  {preview.detection.evidence.length === 0 && (
                    <li>Chưa có bằng chứng trùng khớp.</li>
                  )}
                </ul>
                <button
                  className="confirm-action"
                  type="button"
                  disabled={busy || !mappingProjectId}
                  onClick={() => void confirmRepository()}
                >
                  Xác nhận và ghi nhớ mapping
                </button>
              </div>
            </div>
          )}
        </section>

        <aside className="detail-panel">
          <div className="section-heading">
            <span>03</span>
            <h2>Project detail</h2>
          </div>
          {selectedProject ? (
            <>
              <p className="detail-kicker">PROJECT / {selectedProject.project.id.slice(0, 8)}</p>
              <h3>{selectedProject.project.name}</h3>
              <dl>
                <div>
                  <dt>Repositories</dt>
                  <dd>{selectedProject.repositories.length}</dd>
                </div>
                <div>
                  <dt>Aliases</dt>
                  <dd>{selectedProject.aliases.length}</dd>
                </div>
              </dl>
              <form className="alias-form" onSubmit={(event) => void addAlias(event)}>
                <label className="field">
                  <span>Bí danh mới</span>
                  <input
                    value={alias}
                    onChange={(event) => setAlias(event.target.value)}
                    placeholder="Tên gọi khác"
                  />
                </label>
                <button type="submit" disabled={!alias.trim()}>
                  Thêm bí danh
                </button>
              </form>
              <div className="tag-list">
                {selectedProject.aliases.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
              <div className="repo-list">
                {selectedProject.repositories.map((item) => (
                  <article key={item.id}>
                    <strong>{item.projectName ?? 'Repository'}</strong>
                    <code>{item.canonicalRoot}</code>
                    <small>{item.branch ?? 'branch chưa ghi nhận'}</small>
                  </article>
                ))}
              </div>
              <button
                className="archive-action"
                type="button"
                onClick={() => void archiveProject()}
              >
                Lưu trữ project
              </button>
            </>
          ) : (
            <p className="empty-state">Chọn một project để xem chi tiết.</p>
          )}
        </aside>
      </div>
    </main>
  );
}
