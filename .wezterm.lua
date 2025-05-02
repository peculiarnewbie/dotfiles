-- Pull in the wezterm API
local wezterm = require("wezterm")

-- This will hold the configuration.
local config = wezterm.config_builder()

local act = wezterm.action

-- This is where you actually apply your config choices

-- For example, changing the color scheme:
config.color_scheme = "Catppuccin Mocha"

-- Spawn a powershell in login mode
config.default_prog = { "C:/Program Files/PowerShell/7/pwsh.exe", "-l" }

config.front_end = "WebGpu"
config.max_fps = 144
config.font_size = 11.0
config.use_fancy_tab_bar = false
config.window_decorations = "RESIZE"
config.webgpu_power_preference = "HighPerformance"

config.keys = {
	{
		key = "w",
		mods = "CTRL",
		action = act.CloseCurrentPane({ confirm = true }),
	},
	{
		key = "q",
		mods = "ALT",
		action = act.CloseCurrentPane({ confirm = true }),
	},
	{
		key = "a",
		mods = "ALT",
		action = act.ActivatePaneDirection("Left"),
	},
	{
		key = "d",
		mods = "ALT",
		action = act.ActivatePaneDirection("Right"),
	},
	{
		key = "w",
		mods = "ALT",
		action = act.ActivatePaneDirection("Up"),
	},
	{
		key = "s",
		mods = "ALT",
		action = act.ActivatePaneDirection("Down"),
	},
	{
		key = "D",
		mods = "ALT",
		action = wezterm.action.SplitPane({
			direction = "Right",
			size = { Percent = 50 },
		}),
	},
	{
		key = "S",
		mods = "ALT",
		action = wezterm.action.SplitPane({
			direction = "Down",
			size = { Percent = 50 },
		}),
	},
	{ key = "h", mods = "ALT", action = act.ActivateTabRelative(-1) },
	{ key = "l", mods = "ALT", action = act.ActivateTabRelative(1) },
	{ key = "h", mods = "SHIFT|ALT", action = act.MoveTabRelative(-1) },
	{ key = "l", mods = "SHIFT|ALT", action = act.MoveTabRelative(1) },
	{ key = "t", mods = "CTRL", action = act.SpawnTab("DefaultDomain") },
	{ key = "n", mods = "ALT", action = act.SpawnTab("DefaultDomain") },
}

local mux = wezterm.mux

wezterm.on("gui-startup", function(cmd)
	-- allow `wezterm start -- something` to affect what we spawn
	-- in our initial window
	local args = {}
	if cmd then
		args = cmd.args
	end

	local tab, home_pane, window = mux.spawn_window({
		workspace = "home",
	})
	local kanata_pane = home_pane:split({
		direction = "Top",
		size = 0.6,
	})
	tab:set_title("run")
	kanata_pane:send_text("kanata-cmd -n\r\n")
	home_pane:send_text("syncthing \r\n")

	local newtab, yazi_pane, new_window = window:spawn_tab({})
	yazi_pane:send_text("yy \r\n")
	newtab:set_title("yazi")

	local last_tab, last_pane, last_window = window:spawn_tab({})
	local split_pane = last_pane:split({
		direction = "Right",
		size = 0.5,
	})
	last_pane:send_text("komorebic start --bar \r\n")

	-- We want to startup in the coding workspace
	mux.set_active_workspace("home")
end)

-- and finally, return the configuration to wezterm
return config
