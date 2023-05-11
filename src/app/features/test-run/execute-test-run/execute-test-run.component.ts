import { Component, Inject, OnInit, ViewChild } from '@angular/core';
import {
  MatDialog,
  MatDialogRef,
  MAT_DIALOG_DATA,
} from '@angular/material/dialog';
import * as appConstants from 'src/app/app.constants';
import { DataService } from '../../../core/services/data-service';
import { AppConfigService } from '../../../app-config.service';
import { Subscription } from 'rxjs';
import { CdTimerComponent } from 'angular-cd-timer';
import { SbiTestCaseService } from '../../../core/services/sbi-testcase-service';
import { SdkTestCaseService } from '../../../core/services/sdk-testcase-service';
import { SbiTestCaseAndroidService } from '../../../core/services/sbi-testcase-android-service';
import { TestCaseModel } from 'src/app/core/models/testcase';
import { Router } from '@angular/router';
import { SbiProjectModel } from 'src/app/core/models/sbi-project';
import { SbiDiscoverResponseModel } from 'src/app/core/models/sbi-discover';
import { SdkProjectModel } from 'src/app/core/models/sdk-project';
import { ScanDeviceComponent } from '../scan-device/scan-device.component';
import { environment } from 'src/environments/environment';
import { AbisTestCaseService } from 'src/app/core/services/abis-testcase-service';
import { AbisProjectModel } from 'src/app/core/models/abis-project';
import { RxStompService } from 'src/app/core/services/rx-stomp.service';
import { ActiveMqService } from 'src/app/core/services/activemq-service';
import { Message } from '@stomp/stompjs';
import { UserProfileService } from 'src/app/core/services/user-profile.service';
import { TranslateService } from '@ngx-translate/core';

declare const start_streaming: any;
declare const stop_streaming: any;

@Component({
  selector: 'app-execute-test-run',
  templateUrl: './execute-test-run.component.html',
  styleUrls: ['./execute-test-run.component.css'],
})
export class ExecuteTestRunComponent implements OnInit {
  input: any;
  collectionId: string;
  projectType: string;
  projectId: string;
  sbiProjectData: SbiProjectModel;
  sdkProjectData: SdkProjectModel;
  abisProjectData: AbisProjectModel;
  collectionName: string;
  subscriptions: Subscription[] = [];
  scanComplete = true;
  runComplete = false;
  validationErrMsg: string;
  currectTestCaseId: string;
  currectTestCaseName: string;
  currentTestDescription: string;
  currectDeviceSubId: string;
  currentTestCaseIsRCapture = false;
  errorsInGettingTestcases = false;
  serviceErrors = false;
  errorsInSavingTestRun = false;
  showLoader = false;
  initiateCapture = false;
  showInitiateCaptureBtn = false;
  showStreamingBtn = false;
  streamingDone = false;
  pauseExecution = false;
  showResumeBtn = false;
  showResumeAgainBtn = false;
  showContinueBtn = false;
  beforeKeyRotationResp: any = null;
  errorsSummary: string[];
  testCasesList: any;
  testRunId: string;
  dataLoaded = false;
  startTestRunDt: string;
  endTestRunDt: string;
  progressDone = 0;
  sbiDeviceType: string;
  @ViewChild('basicTimer', { static: true }) basicTimer: CdTimerComponent;
  countOfSuccessTestcases = 0;
  countOfFailedTestcases = 0;
  sbiSelectedPort = localStorage.getItem(appConstants.SBI_SELECTED_PORT)
    ? localStorage.getItem(appConstants.SBI_SELECTED_PORT)
    : null;
  sbiSelectedDevice = localStorage.getItem(appConstants.SBI_SELECTED_DEVICE)
    ? localStorage.getItem(appConstants.SBI_SELECTED_DEVICE)
    : null;
  keyRotationIterations = this.appConfigService.getConfig()[
    appConstants.SBI_KEY_ROTATION_ITERATIONS
  ]
    ? parseInt(
      this.appConfigService.getConfig()[
      appConstants.SBI_KEY_ROTATION_ITERATIONS
      ]
    )
    : 0;
  currentKeyRotationIndex = 0;
  isAndroidAppMode = environment.isAndroidAppMode == 'yes' ? true : false;
  abisRequestSendFailure = false;
  abisSentMessage: string = appConstants.BLANK_STRING;
  abisSentDataSource: string = appConstants.BLANK_STRING;
  abisRecvdMessage: string = appConstants.BLANK_STRING;
  cbeffFileSuffix: number = 0;
  currentCbeffFile: number = 0;
  isCombinationAbisTestcase = false;
  currentAbisMethod: string = appConstants.BLANK_STRING;
  textDirection: any = this.userProfileService.getTextDirection();
  resourceBundleJson: any = {};

  constructor(
    private dialogRef: MatDialogRef<ExecuteTestRunComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dataService: DataService,
    private userProfileService: UserProfileService,
    private translate: TranslateService,
    private router: Router,
    private dialog: MatDialog,
    private sbiTestCaseService: SbiTestCaseService,
    private sdkTestCaseService: SdkTestCaseService,
    private sbiTestCaseAndroidService: SbiTestCaseAndroidService,
    private abisTestCaseService: AbisTestCaseService,
    private appConfigService: AppConfigService,
    private rxStompService: RxStompService,
    private activeMqService: ActiveMqService
  ) {
    dialogRef.disableClose = true;
  }

  async ngOnInit() {
    this.translate.use(this.userProfileService.getUserPreferredLanguage());
    this.dataService.getResourceBundle(this.userProfileService.getUserPreferredLanguage()).subscribe(
      (response: any) => {
        this.resourceBundleJson = response;
      }
    );
    this.input = this.data;
    this.collectionId = this.input.collectionId;
    this.projectType = this.input.projectType;
    this.projectId = this.input.projectId;
    this.sbiDeviceType = this.input.sbiDeviceType;
    this.basicTimer.start();
    localStorage.removeItem(appConstants.SDK_PROJECT_URL);
    if (await this.performValidations()) {
      await this.getCollection();
      await this.getTestcasesForCollection();
      this.dataLoaded = true;
      if (!this.errorsInGettingTestcases) {
        await this.createTestRun();
      }
    }
    this.basicTimer.stop();
  }

  async performValidations(): Promise<boolean> {
    if (this.projectType === appConstants.SBI) {
      this.validationErrMsg = '';
      if (!(this.sbiSelectedPort && this.sbiSelectedDevice)) {
        this.scanComplete = false;
        this.dataLoaded = true;
        return false;
      }
      if (this.sbiSelectedPort && this.sbiSelectedDevice) {
        await this.getSbiProjectDetails();
        const selectedSbiDevice: SbiDiscoverResponseModel = JSON.parse(
          this.sbiSelectedDevice
        );
        if (
          selectedSbiDevice.purpose != '' &&
          this.sbiProjectData.purpose != selectedSbiDevice.purpose
        ) {
          this.scanComplete = false;
          this.dataLoaded = true;
          this.validationErrMsg = this.resourceBundleJson['executeTestRun']['validationErrMsgForPurpose'];
          return false;
        }
        if (
          this.sbiProjectData.deviceType !=
          selectedSbiDevice.digitalIdDecoded.type
        ) {
          this.scanComplete = false;
          this.dataLoaded = true;
          this.validationErrMsg = this.resourceBundleJson['executeTestRun']['validationErrMsgForDeviceType'];
          return false;
        }
        if (
          this.sbiProjectData.deviceSubType !=
          selectedSbiDevice.digitalIdDecoded.deviceSubType
        ) {
          this.scanComplete = false;
          this.dataLoaded = true;
          this.validationErrMsg = this.resourceBundleJson['executeTestRun']['validationErrMsgForDeviceSubType'];
          return false;
        }
      }
    }
    return true;
  }

  async getSbiProjectDetails() {
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataService.getSbiProject(this.projectId).subscribe(
          (response: any) => {
            //console.log(response);
            this.sbiProjectData = response['response'];
            resolve(true);
          },
          (errors) => {
            this.errorsInGettingTestcases = true;
            resolve(true);
          }
        )
      );
    });
  }

  async getSdkProjectDetails() {
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataService.getSdkProject(this.projectId).subscribe(
          (response: any) => {
            //console.log(response);
            this.sdkProjectData = response['response'];
            resolve(true);
          },
          (errors) => {
            this.errorsInGettingTestcases = true;
            resolve(true);
          }
        )
      );
    });
  }

  async getAbisProjectDetails() {
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataService.getAbisProject(this.projectId).subscribe(
          (response: any) => {
            //console.log(response);
            this.abisProjectData = response['response'];
            resolve(true);
          },
          (errors) => {
            this.errorsInGettingTestcases = true;
            resolve(true);
          }
        )
      );
    });
  }

  async getCollection() {
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataService.getCollection(this.collectionId).subscribe(
          (response: any) => {
            if (response.errors && response.errors.length > 0) {
              this.errorsInGettingTestcases = true;
              resolve(true);
            }
            this.collectionName =
              response[appConstants.RESPONSE][appConstants.NAME];
            resolve(true);
          },
          (errors) => {
            this.errorsInGettingTestcases = true;
            resolve(true);
          }
        )
      );
    });
  }

  async getTestcasesForCollection() {
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataService.getTestcasesForCollection(this.collectionId).subscribe(
          (response: any) => {
            if (response.errors && response.errors.length > 0) {
              this.errorsInGettingTestcases = true;
              resolve(true);
            }
            //console.log(response);
            this.testCasesList =
              response[appConstants.RESPONSE][appConstants.TESTCASES];
            resolve(true);
          },
          (errors) => {
            this.errorsInGettingTestcases = true;
            resolve(true);
          }
        )
      );
    });
  }

  async createTestRun() {
    const testCasesListSorted: TestCaseModel[] = this.testCasesList;
    //sort the testcases based on the testId
    if (testCasesListSorted && testCasesListSorted.length > 0) {
      testCasesListSorted.sort(function (a: TestCaseModel, b: TestCaseModel) {
        if (a.testId > b.testId) return 1;
        if (a.testId < b.testId) return -1;
        return 0;
      });
    }
    //first create a testrun in db
    await this.addTestRun();
    this.testCasesList = testCasesListSorted;
    if (!this.errorsInSavingTestRun) {
      await this.runExecuteForLoop(true, false);
    }
    this.runComplete = true;
    this.basicTimer.stop();
  }

  async runExecuteForLoop(startingForLoop: boolean, fromResumeNext: boolean) {
    for (const testCase of this.testCasesList) {
      this.showLoader = false;
      let proceedTestCase = false;
      if (startingForLoop && testCase.otherAttributes.resumeBtn) {
        this.showResumeBtn = true;
      }
      if (
        !startingForLoop &&
        this.currectTestCaseId != '' &&
        this.currectTestCaseId == testCase.testId
      ) {
        proceedTestCase = true;
      }
      if (
        fromResumeNext &&
        this.currectTestCaseId != '' &&
        testCase.testId == this.currectTestCaseId &&
        testCase.otherAttributes.resumeBtn
      ) {
        this.showResumeBtn = true;
      }
      if (proceedTestCase || startingForLoop) {
        startingForLoop = true;
        this.currectTestCaseId = testCase.testId;
        console.log(`this.currectTestCaseId: ${this.currectTestCaseId}`);
        const testCaseInResourceBundle = this.resourceBundleJson.testcases[testCase.testId];
        this.currectTestCaseName = testCaseInResourceBundle
          ? testCaseInResourceBundle.testName
          : testCase.testName;
        this.currentTestDescription = testCaseInResourceBundle
          ? this.getTestDescription(testCaseInResourceBundle)
          : this.getTestDescription(testCase);
        this.currentTestCaseIsRCapture =
          testCase.methodName[0] == appConstants.SBI_METHOD_RCAPTURE
            ? true
            : false;
        this.currectDeviceSubId = testCase.otherAttributes.deviceSubId;
        if (!this.initiateCapture) {
          this.checkIfToShowInitiateCaptureBtn(testCase);
        }
        if (!this.streamingDone) {
          this.checkIfToShowStreamBtn(testCase);
        }
        const res: any = await this.executeCurrentTestCase(testCase);
        if (res) {
          startingForLoop = this.handleErr(res);
          //handle key rotation flow
          if (this.currentKeyRotationIndex < this.keyRotationIterations) {
            this.handleKeyRotationFlow(startingForLoop, testCase, res);
            if (this.showContinueBtn) {
              await new Promise(async (resolve, reject) => { });
            }
          }
          this.calculateTestcaseResults(res[appConstants.VALIDATIONS_RESPONSE]);
          //update the test run details in db
          await this.addTestRunDetails(testCase, res);
          //update the testrun in db with execution time
          await this.updateTestRun();
          if (testCase.otherAttributes.resumeAgainBtn) {
            this.showResumeAgainBtn = true;
            await new Promise(async (resolve, reject) => { });
          }
          let resetCurrentTestCase = true;
          //reset all attributes for next testcase
          if (this.projectType == appConstants.ABIS) {
            // //disconnect from queue if already connected
            if (this.rxStompService && this.rxStompService.connected()) {
              this.rxStompService.deactivate();
            }
            this.abisRequestSendFailure = false;
            this.abisSentMessage = appConstants.BLANK_STRING;
            this.abisSentDataSource = appConstants.BLANK_STRING;
            this.abisRecvdMessage = appConstants.BLANK_STRING;
            //console.log(`after last round, found cbeffFileSuffix: ${this.cbeffFileSuffix}`);
            if (this.cbeffFileSuffix > 0) {
              //do no reset current testcaseId
              resetCurrentTestCase = false;
              if (this.countOfSuccessTestcases > 0)
                this.countOfSuccessTestcases = this.countOfSuccessTestcases - 1;
              if (this.countOfFailedTestcases > 0)
                this.countOfFailedTestcases = this.countOfFailedTestcases - 1;
              await this.startWithSameTestcase();
            }
            else if (this.isCombinationAbisTestcase) {
              this.currentAbisMethod = appConstants.ABIS_METHOD_IDENTIFY;
              //do no reset current testcaseId
              resetCurrentTestCase = false;
              if (this.countOfSuccessTestcases > 0)
                this.countOfSuccessTestcases = this.countOfSuccessTestcases - 1;
              if (this.countOfFailedTestcases > 0)
                this.countOfFailedTestcases = this.countOfFailedTestcases - 1;
              await this.startWithSameTestcase();
            }
          }
          if (resetCurrentTestCase) {
            this.currectTestCaseId = '';
            this.currectTestCaseName = '';
            this.currentTestDescription = '';
            this.currentCbeffFile = 0;
            this.showLoader = false;             
          }

        }
      }
    }
  }
  getTestDescription(testcase: TestCaseModel) {
    if (!this.isAndroidAppMode) {
      return testcase.testDescription;
    } else {
      return testcase.androidTestDescription
        ? testcase.androidTestDescription
        : testcase.testDescription;
    }
  }
  handleKeyRotationFlow(
    startingForLoop: boolean,
    testCase: TestCaseModel,
    res: any
  ) {
    if (
      startingForLoop &&
      this.projectType === appConstants.SBI &&
      testCase.otherAttributes.keyRotationTestCase
    ) {
      let testcaseFailed = false;
      if (
        res &&
        res[appConstants.VALIDATIONS_RESPONSE] &&
        res[appConstants.VALIDATIONS_RESPONSE][appConstants.RESPONSE]
      ) {
        const validationsList =
          res[appConstants.VALIDATIONS_RESPONSE][appConstants.RESPONSE][
          appConstants.VALIDATIONS_LIST
          ];
        if (validationsList && validationsList.length > 0) {
          validationsList.forEach((validationitem: any) => {
            if (validationitem.status == appConstants.FAILURE) {
              testcaseFailed = true;
            }
          });
        }
      }
      if (!testcaseFailed) {
        this.beforeKeyRotationResp = JSON.parse(res.methodResponse);
        this.showContinueBtn = true;
        this.showLoader = false;
        this.currentKeyRotationIndex++;
      }
    }
  }

  handleErr(res: any) {
    //console.log('handleErr');
    const errors = res[appConstants.ERRORS];
    if (errors && errors.length > 0) {
      this.serviceErrors = true;
      this.errorsSummary = [];
      errors.forEach((err: any) => {

        this.errorsSummary.push(
          err[appConstants.ERROR_CODE] + ' - ' + err[appConstants.MESSAGE]
        );
      });
      return false;
    }
    return true;
  }

  checkIfToShowInitiateCaptureBtn(testCase: TestCaseModel) {
    if (this.projectType === appConstants.SBI) {
      if (testCase.methodName[0] == appConstants.SBI_METHOD_CAPTURE) {
        this.showInitiateCaptureBtn = true;
      }
    }
  }

  checkIfToShowStreamBtn(testCase: TestCaseModel) {
    if (this.projectType === appConstants.SBI) {
      if (
        testCase.methodName[0] == appConstants.SBI_METHOD_RCAPTURE &&
        !this.isAndroidAppMode
      ) {
        this.showStreamingBtn = true;
      }
      if (
        testCase.methodName[0] == appConstants.SBI_METHOD_RCAPTURE &&
        this.isAndroidAppMode
      ) {
        this.streamingDone = true;
        this.showInitiateCaptureBtn = true;
      }
    }
  }

  async addTestRun() {
    this.startTestRunDt = new Date().toISOString();
    const testRunRequest = {
      collectionId: this.collectionId,
      runDtimes: this.startTestRunDt,
    };
    let request = {
      id: appConstants.TEST_RUN_ADD_ID,
      version: appConstants.VERSION,
      requesttime: new Date().toISOString(),
      request: testRunRequest,
    };
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataService.addTestRun(request).subscribe(
          (response: any) => {
            if (response.errors && response.errors.length > 0) {
              this.errorsInSavingTestRun = true;
              resolve(true);
            }
            this.testRunId = response[appConstants.RESPONSE][appConstants.ID];
            resolve(true);
          },
          (errors) => {
            this.errorsInSavingTestRun = true;
            resolve(true);
          }
        )
      );
    });
  }

  async updateTestRun() {
    this.endTestRunDt = new Date().toISOString();
    const testRunRequest = {
      id: this.testRunId,
      collectionId: this.collectionId,
      runDtimes: this.startTestRunDt,
      executionDtimes: this.endTestRunDt,
    };
    let request = {
      id: appConstants.TEST_RUN_UPDATE_ID,
      version: appConstants.VERSION,
      requesttime: new Date().toISOString(),
      request: testRunRequest,
    };
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataService.updateTestRun(request).subscribe(
          (response: any) => {
            if (response.errors && response.errors.length > 0) {
              this.errorsInSavingTestRun = true;
              resolve(true);
            }
            resolve(true);
          },
          (errors) => {
            this.errorsInSavingTestRun = true;
            resolve(true);
          }
        )
      );
    });
  }

  async addTestRunDetails(testCase: TestCaseModel, res: any) {
    let resultStatus = appConstants.FAILURE;
    let countofPassedValidators = 0;
    let validations: any = [];
    if (
      res &&
      res[appConstants.VALIDATIONS_RESPONSE] &&
      res[appConstants.VALIDATIONS_RESPONSE][appConstants.RESPONSE]
    ) {
      const validationsList =
        res[appConstants.VALIDATIONS_RESPONSE][appConstants.RESPONSE][
        appConstants.VALIDATIONS_LIST
        ];
      if (validationsList && validationsList.length > 0) {
        validationsList.forEach((validationitem: any) => {
          if (validationitem.status == appConstants.SUCCESS) {
            countofPassedValidators++;
          }
        });
        if (validationsList.length == countofPassedValidators) {
          resultStatus = appConstants.SUCCESS;
        } else {
          resultStatus = appConstants.FAILURE;
        }
        validations = validationsList;
      }
    }
    const testRunRequest = {
      runId: this.testRunId,
      testcaseId: testCase.testId,
      methodUrl: res.methodUrl ? res.methodUrl : '',
      methodRequest: res.methodRequest,
      methodResponse: res.methodResponse,
      resultStatus: resultStatus,
      resultDescription: JSON.stringify({
        validationsList: validations,
      }),
      testDataSource: res.testDataSource ? res.testDataSource : '',
    };
    let request = {
      id: appConstants.TEST_RUN_DETAILS_ADD_ID,
      version: appConstants.VERSION,
      requesttime: new Date().toISOString(),
      request: testRunRequest,
    };
    return new Promise((resolve, reject) => {
      this.subscriptions.push(
        this.dataService.addTestRunDetails(request).subscribe(
          (response: any) => {
            if (response.errors && response.errors.length > 0) {
              this.errorsInSavingTestRun = true;
              resolve(true);
            }
            // console.log(response);
            if (this.projectType == appConstants.ABIS) {
              if (this.cbeffFileSuffix == 0 && !this.isCombinationAbisTestcase) {
                this.progressDone =
                  this.progressDone + 100 / this.testCasesList.length;
              }
            } else {
              this.progressDone =
                this.progressDone + 100 / this.testCasesList.length;
            }
            resolve(true);
          },
          (errors) => {
            this.errorsInSavingTestRun = true;
            if (this.projectType == appConstants.ABIS) {
              if (this.cbeffFileSuffix == 0) {
                this.progressDone =
                  this.progressDone + 100 / this.testCasesList.length;
              }
            } else {
              this.progressDone =
                this.progressDone + 100 / this.testCasesList.length;
            }
            resolve(true);
          }
        )
      );
    });
  }
  async executeCurrentTestCase(testCase: TestCaseModel) {
    return new Promise(async (resolve, reject) => {
      if (this.projectType === appConstants.SBI) {
        if (
          testCase.methodName[0] == appConstants.SBI_METHOD_CAPTURE ||
          testCase.methodName[0] == appConstants.SBI_METHOD_RCAPTURE
        ) {
          if (this.initiateCapture) {
            this.initiateCapture = false;
            this.showLoader = true;
            let res: any;
            if (!this.isAndroidAppMode) {
              res = await this.sbiTestCaseService.runTestCase(
                testCase,
                this.sbiSelectedPort ? this.sbiSelectedPort : '',
                this.sbiSelectedDevice ? this.sbiSelectedDevice : '',
                null
              );
            } else {
              res = await this.sbiTestCaseAndroidService.runTestCase(
                testCase,
                this.sbiDeviceType,
                this.sbiSelectedPort ? this.sbiSelectedPort : '',
                this.sbiSelectedDevice ? this.sbiSelectedDevice : '',
                null
              );
            }
            this.streamingDone = false;
            if (!this.isAndroidAppMode) {
              this.stopStreaming();
            }
            resolve(res);
          } else {
            //no resp to keep the for loop on hold
          }
        } else {
          if (this.showResumeBtn) {
            this.pauseExecution = true;
          }
          if (!this.pauseExecution) {
            this.showLoader = true;
            let beforeKeyRotationDeviceResp = null;
            if (
              testCase.otherAttributes.keyRotationTestCase &&
              this.beforeKeyRotationResp
            ) {
              beforeKeyRotationDeviceResp = this.beforeKeyRotationResp;
            }
            let res: any;
            if (!this.isAndroidAppMode) {
              res = await this.sbiTestCaseService.runTestCase(
                testCase,
                this.sbiSelectedPort ? this.sbiSelectedPort : '',
                this.sbiSelectedDevice ? this.sbiSelectedDevice : '',
                beforeKeyRotationDeviceResp
              );
            } else {
              res = await this.sbiTestCaseAndroidService.runTestCase(
                testCase,
                this.sbiDeviceType,
                this.sbiSelectedPort ? this.sbiSelectedPort : '',
                this.sbiSelectedDevice ? this.sbiSelectedDevice : '',
                beforeKeyRotationDeviceResp
              );
            }
            this.beforeKeyRotationResp = null;
            resolve(res);
          } else {
            //no resp to keep the for loop on hold
          }
        }
      } else if (this.projectType == appConstants.SDK) {
        if (!this.sdkProjectData)
          await this.getSdkProjectDetails();
        localStorage.setItem(
          appConstants.SDK_PROJECT_URL,
          this.sdkProjectData ? this.sdkProjectData.url : ''
        );
        this.showLoader = true;
        const res = await this.sdkTestCaseService.runTestCase(
          testCase,
          this.sdkProjectData.url,
          this.sdkProjectData.bioTestDataFileName
        );
        resolve(res);
      } else if (this.projectType == appConstants.ABIS) {
        this.isCombinationAbisTestcase = testCase.methodName.length > 1 ? true : false;
        //console.log(`isCombinationTestCase: ${this.isCombinationAbisTestcase}`);
        if (this.isCombinationAbisTestcase && this.currentAbisMethod == appConstants.BLANK_STRING) {
          this.currentAbisMethod = appConstants.ABIS_METHOD_INSERT;
        }
        if (!this.isCombinationAbisTestcase) {
          this.currentAbisMethod = testCase.methodName[0];
        }
        if (this.abisRecvdMessage == appConstants.BLANK_STRING) {
          this.showLoader = true;
          if (!this.abisProjectData)
            await this.getAbisProjectDetails();
          // //disconnect from queue if already connected
          // if (this.rxStompService.connected()) {
          //   this.rxStompService.deactivate();
          // }
          //setup connection as per project configuration
          this.rxStompService = this.activeMqService.setUpConfig(this.abisProjectData);
          let requestId = "";
          let referenceId = "";
          let insertCount = 0;

          if (this.currentAbisMethod == appConstants.ABIS_METHOD_INSERT) {
            //ABIS testcase can have multiple CBEFF files, for each CBEFF file, same processing is reqd
            //this will help in cases where multiple sets of biometrics are to be inserted in ABIS in same testcase
            if (testCase.otherAttributes.bulkInsert && testCase.otherAttributes.insertCount) {
              insertCount = Number.parseInt(testCase.otherAttributes.insertCount);
            }
            //ABIS requestId is unique per request so set to testRunId_testcaseId
            requestId = this.testRunId + appConstants.UNDERSCORE + testCase.testId;
            if (insertCount > 1) {
              //cbeffFileSuffix keeps track of the current CBEFF file index for a testcase
              if (this.cbeffFileSuffix == 0) {
                this.cbeffFileSuffix = 1;
              }
              requestId = requestId + appConstants.UNDERSCORE + this.cbeffFileSuffix;
            }
            //ABIS referenceId is unique per set of biometrics so set to testRunId_testcaseId
            referenceId = requestId;
          }

          let galleryIds: { referenceId: string; }[] = [];
          //if testcase defines identifyReferenceId, then it is used 
          if (this.currentAbisMethod == appConstants.ABIS_METHOD_IDENTIFY) {
            requestId = this.testRunId + appConstants.UNDERSCORE + testCase.testId + appConstants.UNDERSCORE + appConstants.ABIS_METHOD_IDENTIFY;
            if (testCase.otherAttributes.identifyReferenceId) {
              referenceId = this.testRunId + appConstants.UNDERSCORE + testCase.otherAttributes.identifyReferenceId;
            }
            if (testCase.otherAttributes.identifyGalleryIds) {
              testCase.otherAttributes.identifyGalleryIds.forEach((galleryId: string) => {
                galleryIds.push({
                  "referenceId": this.testRunId + appConstants.UNDERSCORE + galleryId
                });
              });
            }
          }
          console.log(`requestId: ${requestId}`);
          console.log(`referenceId: ${referenceId}`);
          //console.log(`cbeffFileSuffix: ${this.cbeffFileSuffix}`);
          this.currentCbeffFile = this.cbeffFileSuffix;
          this.abisRequestSendFailure = false;
          let methodIndex = 0;
          if (this.currentAbisMethod == appConstants.ABIS_METHOD_IDENTIFY) {
            methodIndex = 1;
          }

          const abisReq: any = await this.abisTestCaseService.sendRequestToQueue(
            this.rxStompService,
            testCase,
            this.abisProjectData,
            this.currentAbisMethod,
            methodIndex,
            requestId,
            referenceId,
            galleryIds,
            this.cbeffFileSuffix,
          );
          if (abisReq && abisReq[appConstants.STATUS] && abisReq[appConstants.STATUS] == appConstants.SUCCESS) {
            if (insertCount > 1) {
              this.cbeffFileSuffix = this.cbeffFileSuffix + 1;
            }
            if (this.cbeffFileSuffix > insertCount) {
              //reset the cbeffFileSuffix to zero, since all are processed
              this.cbeffFileSuffix = 0;
            }
            this.abisSentMessage = abisReq.methodRequest;
            this.abisSentDataSource = abisReq.testDataSource;
            this.subscribeToABISQueue(requestId);
          } else {
            console.log("INSERT REQUEST FAILED");
            this.cbeffFileSuffix = 0;
            this.abisRequestSendFailure = true;
            this.abisSentMessage = appConstants.BLANK_STRING;
            this.abisSentDataSource = appConstants.BLANK_STRING;
            resolve(true);
          }
        } else {
          this.showLoader = true;
          //run validations
          let methodIndex = 0;
          if (this.currentAbisMethod == appConstants.ABIS_METHOD_IDENTIFY) {
            methodIndex = 1;
          }
          const validatorsResp = await this.abisTestCaseService.runValidators(testCase, this.abisProjectData, this.currentAbisMethod,
            this.abisSentMessage, this.abisRecvdMessage, this.abisSentDataSource, methodIndex);
          if (this.currentAbisMethod == appConstants.ABIS_METHOD_IDENTIFY) {
            this.isCombinationAbisTestcase = false;
            this.currentAbisMethod = appConstants.BLANK_STRING;
          }
          resolve(validatorsResp);
        }
      } else {
        resolve(true);
      }
    });
  }

  calculateTestcaseResults(res: any) {
    let allValidatorsPassed = false;
    if (res && res[appConstants.RESPONSE]) {
      let countofPassedValidators = 0;
      const response = res[appConstants.RESPONSE];
      const validationsList = response[appConstants.VALIDATIONS_LIST];
      if (validationsList) {
        validationsList.forEach((validationitem: any) => {
          if (validationitem.status == appConstants.SUCCESS) {
            countofPassedValidators++;
          }
        });
        if (validationsList.length == countofPassedValidators) {
          allValidatorsPassed = true;
        }
      }
    }
    if (allValidatorsPassed) {
      this.countOfSuccessTestcases++;
    } else {
      this.countOfFailedTestcases++;
    }
  }

  getAbisSentMessage() {
    if (this.currentAbisMethod == appConstants.ABIS_METHOD_INSERT) {
      let translatedMsg = this.resourceBundleJson["executeTestRun"]["abisInsertRequestSent"];
      if (this.currentCbeffFile == 0) {
        translatedMsg = translatedMsg.replace(/\{\}/g, "");
      } else {
        translatedMsg = translatedMsg.replace(/\{\}/g, (this.currentCbeffFile));
      }
      return translatedMsg;
    }
    if (this.currentAbisMethod == appConstants.ABIS_METHOD_IDENTIFY) {
      let translatedMsg = this.resourceBundleJson["executeTestRun"]["abisIdentifyRequestSent"];
      return translatedMsg;
    }
  }

  async setInitiateCapture() {
    this.initiateCapture = true;
    this.showInitiateCaptureBtn = false;
    await this.runExecuteForLoop(false, false);
    this.runComplete = true;
    this.basicTimer.stop();
  }

  async setResume() {
    this.showResumeBtn = false;
    this.pauseExecution = false;
    await this.runExecuteForLoop(false, false);
    this.runComplete = true;
    this.basicTimer.stop();
  }

  getIndexInList() {
    let testCases = this.testCasesList;
    for (const testCase of this.testCasesList) {
      if (
        this.currectTestCaseId != '' &&
        this.currectTestCaseId == testCase.testId
      ) {
        let ind = testCases.indexOf(testCase);
        return ind;
      }
    }
    return -1;
  }

  async setResumeAgain() {
    this.showResumeAgainBtn = false;
    this.pauseExecution = false;
    await this.startWithNextTestcase();
  }

  async startWithNextTestcase() {
    let testCases = this.testCasesList;
    const currentId = this.currectTestCaseId;
    if (
      this.testCasesList.length > 1 &&
      this.getIndexInList() + 1 < this.testCasesList.length
    ) {
      for (const testCase of this.testCasesList) {
        if (currentId != '' && currentId == testCase.testId) {
          let ind = testCases.indexOf(testCase);
          ind = ind + 1;
          if (testCases[ind]) this.currectTestCaseId = testCases[ind].testId;
        }
      }
      await this.runExecuteForLoop(false, true);
    }
    this.runComplete = true;
    this.basicTimer.stop();
  }

  async startWithSameTestcase() {
    await this.runExecuteForLoop(false, true);
    this.runComplete = true;
    this.basicTimer.stop();
  }

  getStreamImgTagId() {
    let id = this.currectTestCaseId;
    return id;
  }

  startStreaming() {
    this.showStreamingBtn = false;
    this.stopStreaming();
    const selectedSbiDevice: SbiDiscoverResponseModel = JSON.parse(
      this.sbiSelectedDevice ? this.sbiSelectedDevice : ''
    );
    const deviceId = selectedSbiDevice.deviceId;
    const deviceSubId = this.currectDeviceSubId;
    let methodUrl = '';
    const SBI_BASE_URL = this.appConfigService.getConfig()['SBI_BASE_URL'];
    methodUrl =
      SBI_BASE_URL +
      ':' +
      this.sbiSelectedPort +
      '/' +
      appConstants.SBI_METHOD_STREAM;
    start_streaming(methodUrl, deviceId, deviceSubId, this.getStreamImgTagId());
    this.streamingDone = true;
    this.showInitiateCaptureBtn = true;
  }

  stopStreaming() {
    stop_streaming();
  }

  async setContinue() {
    this.showContinueBtn = false;
    await this.runExecuteForLoop(false, false);
    this.runComplete = true;
    this.basicTimer.stop();
  }

  /*
  scanDevice() {
    const body = {
      title: 'Scan Device',
    };
    this.dialog
      .open(ScanDeviceComponent, {
        width: '600px',
        data: body,
      })
      .afterClosed()
      .subscribe(() => {
        this.sbiSelectedPort = localStorage.getItem(
          appConstants.SBI_SELECTED_PORT
        )
          ? localStorage.getItem(appConstants.SBI_SELECTED_PORT)
          : null;
        this.sbiSelectedDevice = localStorage.getItem(
          appConstants.SBI_SELECTED_DEVICE
        )
          ? localStorage.getItem(appConstants.SBI_SELECTED_DEVICE)
          : null;
      });
  }*/

  close() {
    this.dialogRef.close('reloadProjectDetails');
  }

  viewTestRun() {
    this.dialogRef.close('');
    this.router.navigate([
      `toolkit/project/${this.projectType}/${this.projectId}/collection/${this.collectionId}/testrun/${this.testRunId}`,
    ]);
  }

  subscribeToABISQueue(sentRequestId: string) {
    this.rxStompService
      .watch(this.abisProjectData.inboundQueueName)
      .forEach(async (message: Message) => {
        const respObj = JSON.parse(message.body);
        const recvdRequestId = respObj[appConstants.REQUEST_ID];
        console.log(`recvdRequestId: ${recvdRequestId}`);
        if (sentRequestId == recvdRequestId) {
          this.abisRecvdMessage = message.body;
          await this.runExecuteForLoop(false, false);
          this.runComplete = true;
          this.basicTimer.stop();
        }
      });
  }

  ngOnDestroy() {
    if (this.rxStompService) {
      this.rxStompService.deactivate();
    }
  }

  getExecuteSuccessMsg(): any {
    const executeTestRunInResourceBundle = this.resourceBundleJson.executeTestRun;
    return this.testCasesList.length > 1
      ? `${executeTestRunInResourceBundle['total']} ${this.testCasesList.length} ${executeTestRunInResourceBundle['testcases']} `
      : `${executeTestRunInResourceBundle['total']} ${this.testCasesList.length} ${executeTestRunInResourceBundle['testcase']} `
  }
}
