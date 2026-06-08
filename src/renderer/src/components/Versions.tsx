import { useState } from 'react'

function Versions(): React.JSX.Element {
  const [versions] = useState(window.electron.process.versions)

  return (
    <ul className="flex items-center gap-2.5 m-0 p-0 border-none bg-transparent flex-shrink-0 list-none leading-none">
      <li className="text-[11px] font-medium text-accent-text opacity-85 leading-none">Electron v{versions.electron}</li>
      <li className="text-[11px] font-medium text-accent-text opacity-85 leading-none">Chromium v{versions.chrome}</li>
      <li className="text-[11px] font-medium text-accent-text opacity-85 leading-none">Node v{versions.node}</li>
    </ul>
  )
}

export default Versions
