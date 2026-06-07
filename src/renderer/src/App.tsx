import FileExplorer from './components/FileExplorer'

function App(): React.JSX.Element {
  return (
    <div className="ide-layout">
      <div className="left-pane">
        <FileExplorer />
      </div>
      <div className="right-pane"></div>
    </div>
  )
}

export default App