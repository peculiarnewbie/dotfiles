return {
  {
    "EdenEast/nightfox.nvim",
    opts = {
      palettes = {
        carbonfox = {
          bg1 = "#000000",
        },
      },
    },
    options = {
      transparent = false, -- Ensure transparency is off so nightfox sets the background [2, 3]
      terminal_colors = true, -- Set terminal colors for the built-in terminal [2, 3]
    },
  },

  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "carbonfox",
    },
  },
}
