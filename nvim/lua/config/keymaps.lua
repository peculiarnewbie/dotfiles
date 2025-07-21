-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.keymap.set({ "n", "x" }, "<leader>p", function()
  Snacks.picker.recent({ filter = { cwd = true } })
end, { desc = "Recent (cwd)" })

vim.keymap.del("n", "<leader>e")

vim.keymap.set({ "n" }, "<leader>e", function()
  -- Check if current buffer is nvim-tree
  if vim.bo.filetype == "NvimTree" then
    -- If we're in nvim-tree, close it
    vim.cmd("NvimTreeClose")
  else
    -- If we're not in nvim-tree, focus/open it
    vim.cmd("NvimTreeFocus")
  end
end, { desc = "nvim tree smart toggle" })
