// src/MyNoHScrollPlugin/index.ts
import Plugin from '@jbrowse/core/Plugin'
import PluginManager from '@jbrowse/core/PluginManager'
import LinearGenomeViewPlugin from '@jbrowse/plugin-linear-genome-view'
import React from 'react'

export default class MyNoHScrollPlugin extends Plugin {
  name = 'MyNoHScrollPlugin'

  override install(pluginManager: PluginManager) {

    // 2. get hold of its viewType
    const lgv = pluginManager.getViewType('LinearGenomeView')

    console.log(lgv, 'sent lgv')

    // // 3. re‑register a wrapped viewType
    // pluginManager.addViewType(() => ({
    //   ...lgv!,

    //   addDisplayType: lgv?.addDisplayType!,
    //   displayName: lgv?.displayName!,
    //   ReactComponent: (props: any) => {
    //     const Inner = lgv?.ReactComponent!
    //     return (
    //       <div
    //         style={{ overflowX: 'hidden' }}
    //         onWheel={e => {
    //           // cancel sideways wheel/pinch
    //           if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    //             e.preventDefault()
    //           }
    //         }}
    //       >
    //         <Inner {...props} />
    //       </div>
    //     )
    //   },
    // }))
  }
}
