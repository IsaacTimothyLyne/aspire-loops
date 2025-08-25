import { Component } from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from "@angular/router";
import {BottomPlayer} from "@shared/ui/bottom-player/bottom-player";

@Component({
  selector: 'app-app-shell',
    imports: [
        RouterLink,
        RouterOutlet,
        BottomPlayer,
        RouterLinkActive
    ],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss'
})
export class AppShell {

}
