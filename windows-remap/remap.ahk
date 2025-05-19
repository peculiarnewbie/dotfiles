#Requires AutoHotkey v2.0
; CapsLock as Ctrl when held, Esc when tapped (AHK v2, no timer)

$*CapsLock::
{
    start := A_TickCount
    if (KeyWait("CapsLock", "T0.1")) {
        Send("{Esc}")
    } else {
        Send("{Ctrl down}")
        KeyWait("CapsLock")
        Send("{Ctrl up}")
    }
    return
}

; delay tab hold action

$*Tab::
{
    start := A_TickCount
    if (KeyWait("Tab", "T0.1")) {
        Send("{Tab}")
    } else {
        Send("{Ctrl down}{LWin down}{Alt down}")
        KeyWait("Tab")
        Send("{Ctrl up}{LWin up}{Alt up}")
    }
    return
}
