'use strict';

var path = require('path');
var electron = require('electron');
var fs = require('fs');
var mkdirp = require('mkdirp');

module.exports = function (options) {
  var app = electron.app;
  var screen = electron.screen;
  var state;
  var winRef;
  var stateChangeTimer;
  var eventHandlingDelay = 100;
  // http://electron.atom.io/docs/api/structures/rectangle/
  var rectProps = ['x', 'y', 'width', 'height'];

  var config = Object.assign({
    file: 'window-state.json',
    path: app.getPath('userData'),
    maximize: true,
    fullScreen: true
  }, options);
  var fullStoreFileName = path.join(config.path, config.file);

  function isNormal(win) {
    return !win.isMaximized() && !win.isMinimized() && !win.isFullScreen();
  }

  function hasBounds() {
    return state && rectProps.every(function (v) {
      return state[v] !== undefined;
    });
  }

  function validateState() {
    var isValid = state && (hasBounds() || state.isMaximized || state.isFullScreen);
    if (!isValid) {
      state = null;
      return;
    }

    if (hasBounds() && state.displayBounds) {
      // Check if the display where the window was last open is still available
      var displayBounds = screen.getDisplayMatching(state).bounds;
      var sameBounds = rectProps.every(function (v) {
        return state.displayBounds[v] === displayBounds[v];
      });
      if (!sameBounds) {
        if (displayBounds.width < state.displayBounds.width) {
          if (state.x > displayBounds.width) {
            state.x = null;
          }

          if (state.width > displayBounds.width) {
            state.width = displayBounds.width;
          }
        }

        if (displayBounds.height < state.displayBounds.height) {
          if (state.y > displayBounds.height) {
            state.y = null;
          }

          if (state.height > displayBounds.height) {
            state.height = displayBounds.height;
          }
        }
      }
    }
  }

  function updateState(win) {
    win = win || winRef;
    if (!win) {
      return;
    }

    var winBounds = win.getBounds();
    if (isNormal(win)) {
      state.x = winBounds.x;
      state.y = winBounds.y;
      state.width = winBounds.width;
      state.height = winBounds.height;
    }
    state.isMaximized = win.isMaximized();
    state.isFullScreen = win.isFullScreen();
    state.displayBounds = screen.getDisplayMatching(winBounds).bounds;
  }

  function saveState(win) {
    // Update window state only if it was provided
    if (win) {
      updateState(win);
    }

    // Save state
    try {
      mkdirp.sync(path.dirname(fullStoreFileName));
      fs.writeFileSync(fullStoreFileName, JSON.stringify(state));
    } catch (err) {
      // Don't care
    }
  }

  function stateChangeHandler() {
    // Handles both 'resize' and 'move'
    clearTimeout(stateChangeTimer);
    stateChangeTimer = setTimeout(updateState, eventHandlingDelay);
  }

  function closeHandler() {
    updateState();
  }

  function closedHandler() {
    // Unregister listeners and save state
    unmanage();
    saveState();
  }

  function manage(win) {
    if (config.maximize && state.isMaximized) {
      win.maximize();
    }
    if (config.fullScreen && state.isFullScreen) {
      win.setFullScreen(true);
    }
    win.on('resize', stateChangeHandler);
    win.on('move', stateChangeHandler);
    win.on('close', closeHandler);
    win.on('closed', closedHandler);
    winRef = win;
  }

  function unmanage() {
    if (winRef) {
      winRef.removeListener('resize', stateChangeHandler);
      winRef.removeListener('move', stateChangeHandler);
      clearTimeout(stateChangeTimer);
      winRef.removeListener('close', closeHandler);
      winRef.removeListener('closed', closedHandler);
      winRef = null;
    }
  }

  // Load previous state
  try {
    state = JSON.parse(fs.readFileSync(fullStoreFileName, 'utf8'));
  } catch (err) {}
  // Don't care


  // Check state validity
  validateState();

  // Set state fallback values
  state = Object.assign({
    width: config.defaultWidth || 800,
    height: config.defaultHeight || 600
  }, state);

  return {
    get x() {
      return state.x;
    },
    get y() {
      return state.y;
    },
    get width() {
      return state.width;
    },
    get height() {
      return state.height;
    },
    get isMaximized() {
      return state.isMaximized;
    },
    get isFullScreen() {
      return state.isFullScreen;
    },
    saveState: saveState,
    unmanage: unmanage,
    manage: manage
  };
};
