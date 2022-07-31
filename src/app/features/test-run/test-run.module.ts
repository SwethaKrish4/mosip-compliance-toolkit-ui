import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TestRunRoutingModule } from './test-run-routing.module';
import { BreadcrumbModule, BreadcrumbService  } from 'xng-breadcrumb';
import { MaterialModule } from '../../core/material.module';
import { FormsModule, ReactiveFormsModule } from "@angular/forms";
import { CdTimerModule } from 'angular-cd-timer';

import { ExecuteTestRunComponent } from './execute-test-run/execute-test-run.component';
import { ScanDeviceComponent } from './scan-device/scan-device.component';

@NgModule({
  declarations: [
    ExecuteTestRunComponent,
    ScanDeviceComponent
  ],
  imports: [
    CommonModule,
    TestRunRoutingModule,
    BreadcrumbModule,
    MaterialModule,
    FormsModule,
    ReactiveFormsModule,
    CdTimerModule
  ],
  providers: [BreadcrumbService]
})
export class TestRunModule { }