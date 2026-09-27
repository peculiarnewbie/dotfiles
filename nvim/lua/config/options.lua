-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua

-- disable animations
vim.g.snacks_animate = false

-- prettier only when config
vim.g.lazyvim_prettier_needs_config = true

-- tab as 4 spaces
vim.o.tabstop = 4
vim.o.shiftwidth = 4
vim.o.expandtab = true
vim.o.softtabstop = 4

-- sync with system clipboard (OSC 52 over SSH/herdr)
vim.o.clipboard = "unnamedplus"
