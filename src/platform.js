/**
 * 平台适配层：同一套游戏代码同时运行在「微信小游戏」与「普通浏览器」。
 * 对外统一提供：画布/上下文、逻辑像素宽高、设备像素比、指针事件、窗口尺寸变化。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})
  var isWx = typeof wx !== 'undefined' && !!wx.createCanvas

  function init () {
    var canvas, ctx, width, height, dpr

    if (isWx) {
      var info = wx.getSystemInfoSync()
      dpr = info.pixelRatio || 1
      width = info.windowWidth
      height = info.windowHeight
      canvas = wx.createCanvas()
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
    } else {
      canvas = document.getElementById('game')
      dpr = global.devicePixelRatio || 1
      // 逻辑尺寸优先取画布 CSS 尺寸（index.html 已固定竖屏样式），缺省回退窗口尺寸
      var rc0 = canvas.getBoundingClientRect()
      width = Math.round(rc0.width) || global.innerWidth
      height = Math.round(rc0.height) || global.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
    }

    // 实时测量：浏览器首帧布局可能尚未应用竖屏样式，供游戏启动后校准
    function measure () {
      if (isWx) {
        var inf = wx.getSystemInfoSync()
        return { width: inf.windowWidth, height: inf.windowHeight, dpr: inf.pixelRatio || 1 }
      }
      var rc = canvas.getBoundingClientRect()
      return {
        width: Math.round(rc.width) || global.innerWidth,
        height: Math.round(rc.height) || global.innerHeight,
        dpr: global.devicePixelRatio || 1
      }
    }

    /**
     * 绑定统一指针事件。
     * @param {{down?:Function,move?:Function,up?:Function}} handlers 回调参数为逻辑坐标 {x,y}
     */
    function bindPointer (handlers) {
      handlers = handlers || {}
      if (isWx) {
        wx.onTouchStart(function (e) {
          var t = e.touches && e.touches[0]
          if (t && handlers.down) handlers.down({ x: t.clientX, y: t.clientY })
        })
        wx.onTouchMove(function (e) {
          var t = e.touches && e.touches[0]
          if (t && handlers.move) handlers.move({ x: t.clientX, y: t.clientY })
        })
        wx.onTouchEnd(function (e) {
          var t = e.changedTouches && e.changedTouches[0]
          if (handlers.up) handlers.up(t ? { x: t.clientX, y: t.clientY } : null)
        })
      } else {
        var pressing = false
        // 画布在页面中居中，指针坐标需换算为相对画布左上角
        function pos (e) {
          var rc = canvas.getBoundingClientRect()
          return { x: e.clientX - rc.left, y: e.clientY - rc.top }
        }
        function tpos (t) {
          var rc = canvas.getBoundingClientRect()
          return { x: t.clientX - rc.left, y: t.clientY - rc.top }
        }
        canvas.addEventListener('mousedown', function (e) {
          pressing = true
          if (handlers.down) handlers.down(pos(e))
        })
        global.addEventListener('mousemove', function (e) {
          if (pressing && handlers.move) handlers.move(pos(e))
        })
        global.addEventListener('mouseup', function (e) {
          if (pressing) {
            pressing = false
            if (handlers.up) handlers.up(pos(e))
          }
        })
        // 手机浏览器触摸
        canvas.addEventListener('touchstart', function (e) {
          e.preventDefault()
          if (handlers.down) handlers.down(tpos(e.touches[0]))
        }, { passive: false })
        canvas.addEventListener('touchmove', function (e) {
          e.preventDefault()
          if (handlers.move) handlers.move(tpos(e.touches[0]))
        }, { passive: false })
        canvas.addEventListener('touchend', function (e) {
          e.preventDefault()
          var t = e.changedTouches[0]
          if (handlers.up) handlers.up(t ? tpos(t) : null)
        }, { passive: false })
      }
    }

    function onResize (cb) {
      if (isWx) {
        if (wx.onWindowResize) {
          wx.onWindowResize(function (res) {
            width = res.windowWidth
            height = res.windowHeight
            cb({ width: width, height: height })
          })
        }
      } else {
        global.addEventListener('resize', function () {
          var m = measure()
          width = m.width
          height = m.height
          dpr = m.dpr
          cb({ width: width, height: height, dpr: dpr })
        })
      }
    }

    return {
      isWx: isWx,
      canvas: canvas,
      ctx: ctx,
      measure: measure,
      get width () { return width },
      get height () { return height },
      get dpr () { return dpr },
      bindPointer: bindPointer,
      onResize: onResize
    }
  }

  CR.Platform = { init: init, isWx: isWx }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
