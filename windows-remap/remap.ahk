#Requires AutoHotkey v2.0
; CapsLock as Ctrl when held, Esc when tapped (AHK v2, no timer)

$*CapsLock::
{
    if (KeyWait("CapsLock", "T0.1")) {
        Send("{Esc}")
    } else {
        Send("{Ctrl down}")
        KeyWait("CapsLock")
        Send("{Ctrl up}")
    }
    return
}

$*Tab::
{
    if (KeyWait("Tab", "T0.1")) {
        Send("{Tab}")
    } else {
    }
    return
}

~Tab & h::Send("{Left}")
~Tab & j::Send("{Down}")
~Tab & k::Send("{Up}")
~Tab & l::Send("{Right}")

SendWinShift(key) {
    Send("{LWin down}{Shift down}" key "{Shift up}{LWin up}")
}

~Tab & a:: SendWinShift("a")
~Tab & s:: SendWinShift("s")
~Tab & o:: SendWinShift("o")
~Tab & t:: SendWinShift("t")
~Tab & c:: SendWinShift("c")
~Tab & d:: SendWinShift("d")
~Tab & e:: SendWinShift("e")
~Tab & 0:: SendWinShift("0")

~Tab & f:: SendWinShift("f")
~Tab & q:: SendWinShift("q")
~Tab & w:: SendWinShift("w")
