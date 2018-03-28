const fs = require('fs')
const axios = require('axios')

let nodeCanvas = null
try {
  nodeCanvas = require('canvas')
} catch (ex) {
  throw new Error('Node runtime require node-canvas. please follow https://github.com/Automattic/node-canvas to install node-canvas@2.x')
}

export function createCanvas(width = 300, height = 150) {
  const _createCanvas = nodeCanvas.createCanvas
  const canvas = _createCanvas(width, height)
  canvas.style = {}
  canvas.dataset = {}

  canvas.cloneNode = function (copyContent) {
    const {width, height} = this
    const copied = createCanvas(width, height)
    if(copyContent) {
      const ctx = copied.getContext('2d')
      ctx.drawImage(this, 0, 0, width, height)
    }
    return copied
  }

  return canvas
}

export function loadImage(src) {
  const Image = nodeCanvas.Image
  const img = new Image()
  const base64Pattern = /^data:image\/\w+;base64,/

  const promise = new Promise((resolve) => {
    img.onload = function () {
      resolve(img)
    }
  })

  if(typeof src === 'string') {
    if(base64Pattern.test(src)) {
      const base64Data = src.replace(base64Pattern, '')
      img.src = Buffer.from(base64Data, 'base64')
    } else if(/^https?:\/\//.test(src)) {
      axios.get(src, {responseType: 'arraybuffer'}).then(({data}) => {
        img.src = data
      })
    } else {
      fs.readFile(src, (err, squid) => {
        if(err) {
          throw err
        } else {
          img.src = squid
        }
      })
    }
  } else {
    img.src = src
  }

  return promise
}

const MAX_SIZE = 2048
export function createPathSVG(d, lineWidth, lineCap, lineJoin, strokeColor, fillColor, width = MAX_SIZE, height = MAX_SIZE) {
  const tpl = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <path d="${d}" 
        stroke="${strokeColor || 'black'}" 
        fill="${fillColor || 'transparent'}"
        stroke-width="${lineWidth || 1}"
        stroke-linecap="${lineCap || 'butt'}"
        stroke-linejoin="${lineJoin || 'miter'}"
      ></path>
    </svg>
  `
  const Image = nodeCanvas.Image
  const img = new Image()
  img.src = Buffer.from(tpl, 'utf8')

  return img
}

export function calPathRect(attr) {
  const {d, lineCap, lineJoin, strokeColor, fillColor} = attr
  if(!d) {
    return [0, 0, 0, 0]
  }

  const svg = createPathSVG(d, 1, lineCap, lineJoin, strokeColor, fillColor)

  const {width, height} = svg
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')

  ctx.drawImage(svg, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data

  let left = width
  let top = height
  let right = 0
  let bottom = 0

  for(let j = 0; j < height; j++) {
    for(let i = 0; i < width; i++) {
      const red = data[((width * j) + i) * 4]
      const green = data[((width * j) + i) * 4 + 1]
      const blue = data[((width * j) + i) * 4 + 2]
      const alpha = data[((width * j) + i) * 4 + 3]
      if(red || green || blue || alpha) {
        left = Math.min(i, left)
        top = Math.min(j, top)
        right = Math.max(i, right)
        bottom = Math.max(j, bottom)
      }
    }
  }

  return [left + 1, top + 1, right - left - 1, bottom - top - 1]
}

export function createPath(d) {
  if(!d) return null
  d.replace(/(\s){2,}/g, ' ').trim()
  return {
    getAttribute(attr) {
      if(attr === 'd') {
        return d
      }
    },
  }
}

const {parseSVG, makeAbsolute} = require('svg-path-parser')
export class Path2D {
  constructor(d) {
    this.footprint = []
    this.commands = []
    if(d instanceof Path2D) {
      this.addPath(d)
    } else if(typeof d === 'string') {
      // svg path
      const commands = makeAbsolute(parseSVG(d))
      if(commands[0] && commands[0].code === 'M') {
        this.footprint.push([commands[0].x, commands[0].y])
      }
      this.commands.push(['path', d])
    }
  }
  addPath(path) {
    this.footprint.push(...path.footprint)
    this.commands.push(...path.commands)
  }
  closePath() {
    const point = this.footprint[0]
    if(point) {
      this.moveTo(...point)
    }
  }
  moveTo(x, y) {
    this.footprint.push([x, y])
    this.commands.push(['moveTo', x, y])
  }
  lineTo(x, y) {
    this.footprint.push([x, y])
    this.commands.push(['lineTo', x, y])
  }
  bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
    this.footprint.push([x, y])
    this.commands.push(['bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y])
  }
  quadraticCurveTo(cpx, cpy, x, y) {
    this.footprint.push([x, y])
    this.commands.push('quadraticCurveTo', cpx, cpy, x, y)
  }
  arc(x, y, ...rest) {
    this.footprint.push([x, y])
    this.commands.push('arc', x, y, ...rest)
  }
  arcTo(x1, y1, x2, y2, radius) {
    this.commands.push('artTo', x1, y1, x2, y2, radius)
  }
  ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise) {
    this.footprint.push([x, y])
    this.commands.push('ellipse', x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise)
  }
  rect(x, y, width, height) {
    this.footprint.push([x, y])
    this.commands.push('rect', x, y, width, height)
  }
  draw(context, type = 'stroke') {
    context.save()
    context.beginPath()
    this.commands.forEach((command) => {
      const [cmd, ...args] = command
      if(cmd === 'path') {
        const {lineWidth, lineCap, lineJoin, strokeStyle, fillStyle} = context
        const {width, height} = context.canvas
        const svg = createPathSVG(...args, lineWidth, lineCap, lineJoin, strokeStyle, type === 'stroke' ? null : fillStyle, width, height)
        context.drawImage(svg, 0, 0)
      } else {
        context[cmd](...args)
        context[type]()
      }
    })
    context.restore()
  }
}

const CanvasRenderingContext2D = nodeCanvas.CanvasRenderingContext2D
const _stroke = CanvasRenderingContext2D.prototype.stroke
Object.defineProperty(CanvasRenderingContext2D.prototype, 'stroke', {
  value(p) {
    if(p instanceof Path2D) {
      return p.draw(this, 'stroke')
    }
    return _stroke.call(this)
  },
})

const _fill = CanvasRenderingContext2D.prototype.fill
Object.defineProperty(CanvasRenderingContext2D.prototype, 'fill', {
  value(p) {
    if(p instanceof Path2D) {
      return p.draw(this, 'fill')
    }
    return _fill.call(this)
  },
})

const EventEmitter = require('events')
class Container extends EventEmitter {
  constructor(id) {
    super()
    this.id = id
    this.children = []
    this.clientWidth = 800
    this.clientHeight = 600
  }
  appendChild(node) {
    this.children.push(node)
    node.remove = () => {
      const idx = this.children.indexOf(this)
      if(idx !== -1) {
        this.children.splice(idx, 1)
      }
    }
  }
  insertBefore(node, next) {
    const idx = this.children.indexOf(next)
    if(idx === -1) {
      throw new Error('ERR: no such element')
    } else {
      this.children.splice(idx, 0, node)
    }
  }
  dispatchEvent(evt) {
    return this.emit(evt.type, evt)
  }
  addEventListener(type, handler) {
    return this.addListener(type, handler)
  }
  removeEventListener(type, handler) {
    return this.removeListener(type, handler)
  }
}

export function getContainer(container) {
  if(typeof container === 'string') {
    container = new Container(container)
  }
  if(!container) {
    throw new Error('Container is not defined or cannot found.')
  }
  return container
}

export function shim() {
  global.IS_NODE_ENV = true

  global.requestAnimationFrame = (fn) => {
    setTimeout(() => {
      const [s, ns] = process.hrtime()
      const t = s * 1e3 + ns * 1e-6
      fn(t)
    }, 16)
  }

  global.Path2D = Path2D

  class CustomEvent {
    constructor(type, evt = {}) {
      this.type = type
      Object.assign(this, evt)
    }
  }

  global.CustomEvent = CustomEvent
}
