import { Component, NgZone } from '@angular/core';
import { ApiService } from "./api.service";
import * as dataForge from 'data-forge';
import {DomSanitizer} from '@angular/platform-browser';
import {MatIconRegistry} from '@angular/material/icon';
import { WASI } from '@wasmer/wasi';
import { WasmFs } from '@wasmer/wasmfs';
import * as Turf from "@turf/turf";
import { FormBuilder, FormControl, FormGroup, Validators } from "@angular/forms";
import * as L from 'leaflet';
import 'leaflet-providers';
import { MatStepper } from '@angular/material/stepper';
import { MatTableDataSource } from '@angular/material/table';
import { SelectionModel } from '@angular/cdk/collections';
import { saveAs } from 'file-saver';


//ICONS///

const THUMBUP_ICON = `
  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px">
    <path d="M0 0h24v24H0z" fill="none"/>
    <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.` +
      `44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5` +
      `1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-1.91l-.01-.01L23 10z"/>
  </svg>
`;

const error_outline = '<svg xmlns="http://www.w3.org/2000/svg" height="200px" viewBox="0 0 24 24" width="200px" fill="#000000"><path d="M11 15h2v2h-2v-2zm0-8h2v6h-2V7zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>';



export interface CaseElement {
  zip: number;
  pathogen: number;
  municipality: number;
  dateofinfection: string;
}

export interface ProductElement {
  product: string
}

export interface DurabilityElement {
  productnumber: number,
  variant: number,
  name: string,
  durability:number
}

export interface ResultElement {
  productnumber: number,
  variant: number,
  name: string
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'nova';

  //Vars for data read
  file: any;
  cases: any;
  products: any;
  geojson:any;
  countryGeoJson: any;
  helpExipiary: any;
  population: any;
  distancematrixmode: string = "centroid";
  distancematrix: any;
  fontStyleControl = new FormControl();
  fontStyle?: string;
  // Parameter for the Norwegian Model
  defaultdurability = 7;
  cutoff = 500;
  afterconsume = 0.1;	//#Proportion of durability after durability date things are assumed to be consumed 
  incubationmax = 4;	//#Longest potential incubation time (days) between consumption  and being registered as sick
  incubationmin = 1;	//#Shortest potential incubation time (days) between consumption  and being registered as sick
  epsilon = 100;	//#Constant for multiplying zeroes in likelihood calkulations 
  //output.filename=paste0(Casedata,".V3-Div.")	#Name stem for output pdf plots that will be put in output folder defined earlier
  unselectrandom = false;	//#If "F" cases are run in the order they appear as IDNR to simulate repeated runs over an outbreak. If T random are unselected to simulate random missing.
  mincases = 5;	//#Minimum cases at which to start model
  nrplots = 5;	//#Number of plots to make from mincases to all cases
  postalcodes: any;
  //options for leaflet
  options = {
    layers: [
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "..."
      })
    ],
    zoom: 4,
    center: L.latLng(0, 0),
  };
  layers = [];
  layersControl: any;
  fitBounds = [[50, 0], [80, 25]];
  regions = [];
  center = [0, 0];
  clicked = '';
  jsonMap;
  fileLoaded = false;

  private map;

  //Stepper
  isLinear = false;
  firstFormGroup: FormGroup;
  secondFormGroup: FormGroup;
  thirdFormGroup: FormGroup;
  forthFromGroup: FormGroup;
  //UI variables
  stepIndex = 0;
  // case table
  displayedColumns: string[] = ['select', 'position', 'name', 'weight', 'symbol'];
  dataSource = new MatTableDataSource<CaseElement>();
  selection = new SelectionModel<CaseElement>(true, []);

  //product table
  productsGrouped: any;
  displayedColumnsProducts: string[] = ['select', 'product'];
  dataSourceProduct = new MatTableDataSource<ProductElement>();
  selectionProduct = new SelectionModel<ProductElement>(true, []);

    // case table
  displayedColumnsDurability: string[] = ['position', 'name', 'weight', 'symbol'];
  dataSourceDurability = new MatTableDataSource<DurabilityElement>();
  selectionDurability = new SelectionModel<DurabilityElement>(true, []);
  
      // case table
      displayedColumnsResult: string[] = ['position', 'name', 'weight'];
      dataSourceResult = new MatTableDataSource<ResultElement>();
  
  // spinner
  loading: boolean = false;
  afterloading: boolean = false;
  message: string = "Fetching data from the web. Please wait.";
  start: boolean = false;
  country: string = "NO";
  countryarray = ['ES', 'DK', 'IT', 'LU', 'PT', 'CZ', 'EE', 'NL', 'CH', 'IS', 'NO',
  'DE', 'AT', 'BE', 'SI', 'SK', 'PL', 'FR', 'RO', 'IE', 'FI', 'CY',
  'RS', 'EL', 'UK', 'BG', 'SE', 'MT', 'HR', 'HU', 'LT', 'LV', 'TR'];
  post;

  //Calculation Result
  calculationResult;
  



  constructor(private api: ApiService, private zone: NgZone, private _formBuilder: FormBuilder, iconRegistry: MatIconRegistry, sanitizer: DomSanitizer){   
    iconRegistry.addSvgIconLiteral('error_outline', sanitizer.bypassSecurityTrustHtml(error_outline));  
  }


  onStart() {
    this.loading = true;
    this.afterloading = true;
    console.log(this.country);
    
    this.api.getLAU().subscribe(
      (x: any) => {

      this.handleFileInput();
      this.geojson = dataForge.fromObject(x["features"]);
      this.geojson = this.geojson.toArray();

        //this.api.getPopulation().subscribe(pop => {
          let pop = this.api.getPopulation();
          this.population = pop;
          let laus = x;
          let y = [];
          let popDE = [];
          let pos: any = Array.of(pop)[0];
          console.log("pop", Array.of(pop)[0]);
          console.log("pos", pos);
          console.log("laus", laus);
          
          for (let index = 0; index < pos.length; index++) {

            if (pos[index]["giscoid"].includes(this.country)) {
              popDE.push(pos[index]);
            }

          }

          function getColor(d) {
            return d > 1000 ? '#800026' :
              d > 500 ? '#BD0026' :
                d > 200 ? '#E31A1C' :
                  d > 100 ? '#FC4E2A' :
                    d > 50 ? '#FD8D3C' :
                      d > 20 ? '#FEB24C' :
                        d > 10 ? '#FED976' :
                          '#FFEDA0';
          }

          console.log("pope", popDE);
          

          for (let index = 0; index < x["features"].length; index++) {
            if (x["features"][index]["properties"]["CNTR_CODE"].includes(this.country)) {
              y.push(x["features"][index]);
            }
          }

          for (let index = 0; index < y.length; index++) {
            for (let i = 0; i < popDE.length; i++) {
              if (popDE[i]["giscoid"].includes(y[index]["properties"]["GISCO_ID"])) {
                y[index]["properties"]["density"] = popDE[i]["population"] / Turf.area(y[index]["geometry"]) * 10000000;
                delete y[index]["properties"]["POP_2019"];
                delete y[index]["properties"]["POP_DENS_2019"];
                delete y[index]["properties"]["AREA_KM2"];
                delete y[index]["properties"]["YEAR"];
              }
            }
          }


          console.log("Y", y);

          laus["features"] = y;
          console.log("LA0", laus);

          this.countryGeoJson = laus;
          const defaultBaseLayer= L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 18,
            attribution: "..."
          });
          let defaultOverlay = L.geoJSON(laus as any, {
            onEachFeature: this.onPopUp.bind(this),
            style: function (feature) { // Style option
              return {
                fillColor: getColor(feature.properties.density),
                weight: 2,
                opacity: 1,
                color: 'white',
                dashArray: '3',
                fillOpacity: 0.7
              }
            }
          }
          );

          this.layers = [
            defaultBaseLayer,
            defaultOverlay
          ];

          this.layersControl = {
            baseLayers: {
              'OpenStreetMap Mapnik': defaultBaseLayer,
            },
            overlays: {
              'Norway': defaultOverlay
            }
          };

        }
        )
      //}
    //)
  }

  ngOnInit() {
    this.firstFormGroup = this._formBuilder.group({
      firstCtrl: ['', Validators.required]
    });
    this.secondFormGroup = this._formBuilder.group({
      secondCtrl: ['', Validators.required]
    });
    this.thirdFormGroup = this._formBuilder.group({
      thirdCtrl: ['', Validators.required]
    });
    this.forthFromGroup = this._formBuilder.group({
        defaultdurability: [7, Validators.required],
        cutoff: [500, Validators.required],
        afterconsume: [0.1, Validators.required],	//#Proportion of durability after durability date things are assumed to be consumed 
        incubationmax: [4, Validators.required],	//#Longest potential incubation time (days) between consumption  and being registered as sick
        incubationmin: [1, Validators.required],	//#Shortest potential incubation time (days) between consumption  and being registered as sick
        epsilon: [100, Validators.required],	//#Constant for multiplying zeroes in likelihood calkulations 
        //output.filename=paste0(Casedata,".V3-Div.")	#Name stem for output pdf plots that will be put in output folder defined earlier
        unselectrandom:  [false, Validators.required],	//#If "F" cases are run in the order they appear as IDNR to simulate repeated runs over an outbreak. If T random are unselected to simulate random missing.
        mincases: [5, Validators.required],	//#Minimum cases at which to start model
        nrplots: [5, Validators.required],	//#Number of plots to make from mincases to all cases}
        distancematrixmode: ["centroid", Validators.required]
  });

  }


  onMapReady(map: L.Map): void {
    setTimeout(() => {
        map.invalidateSize();
        this.map = map;
    });
  }


  onPopUp(feature, layer) {

    //let that = this;
    this.zone.run(() => {
      // push polygon names to regions array
      this.regions.push(feature.properties.name);

      layer.on('click', <LeafletMouseEvent>(e) => {
        this.zone.run(() => {
          this.fitBounds = e.target.getBounds();
          this.clicked = e.target.feature.properties.name;
        });
      });
    });
  }



  //Get Geodata from Eurostat (LAU2)
  handleFileInput() {
    console.log("GO");
    

    this.message = "Processing data. Please wait."
    /*this.api.getCodes().subscribe(x => {
      this.post = x;
    })*/

    this.post = this.api.getCodes();

    //this.api.getPostal(this.country).subscribe(x => {
      let country = [];
      let x = this.api.getPostal(this.country);
      JSON.parse(JSON.stringify(x)).forEach(element => {
        if (element["CNTR_ID"] == this.country) {
          country.push(element);
        }
      //});
      this.postalcodes = country;
      this.start = true;
      this.loading = false;
      
    })
  }

  //Read Case file
  handleCaseInput(e:any) {
    this.loading = true;
    this.file = e.target.files[0];
    const reader = new FileReader();
    reader.addEventListener('load', (event) => {
      try {
        
      this.cases = event.target.result;
      this.cases = dataForge.fromJSON(this.cases);
      this.cases = this.cases.toArray();
      console.log(this.cases);
      
      this.dataSource = new MatTableDataSource<CaseElement>(this.cases);
      let casesGEO = [];
      this.cases.forEach(element => {
        this.countryGeoJson["features"].forEach(element2 => {

          if (element2["properties"]["LAU_ID"] == element.zip.toLowerCase()) {
            casesGEO.push(element2);
          }
          
        });
      });

      casesGEO.forEach(element => {
        let count = 0;
        casesGEO.forEach(element2 => {
          if (element["properties"]["LAU_ID"] == element2["properties"]["LAU_ID"]) {
            count++;
          }
        });
        element["properties"]["casenumbers"] = count;
      });

      console.log(casesGEO);

      function getColor(d) {
        return d > 8 ? '#081c15' :
            d > 7 ? '#1b4332' :
              d > 6 ? '#2d6a4f' :
                d > 5 ? '#40916c' :
                  d > 4 ? '#52b788' :
                    d > 3 ? '#74c69d' :
                      d > 2 ? '#95d5b2' :
                        d > 1 ? '#b7e4c7' :
                          d > 0 ? '#d8f3dc' :
                      '#FFEDA0';
      }

      let casesMap = this.countryGeoJson;
      casesMap["features"] = casesGEO;
      let defaultOverlay = L.geoJSON(casesMap as any, {
        onEachFeature: this.onPopUp.bind(this),
        style: function (feature) { // Style option
          return {
            fillColor: getColor(feature.properties.casenumbers),
            weight: 2,
            opacity: 1,
            color: 'white',
            dashArray: '3',
            fillOpacity: 0.7
          }
        }
      });

      this.layers.push(defaultOverlay);
      this.layersControl.overlays["cases"] = defaultOverlay;
      this.masterToggle();
      this.loading = false;
      this.fileLoaded = false;


    } catch (error) {
      this.message = "File cannot be read. Please valitade file or file format."
      this.fileLoaded = true;
    }
    });
    reader.readAsText(this.file);
  }

  //Read Product file
  handleProductInput(e:any) {
    this.loading = true;
    this.file = e.target.files[0];
    const reader = new FileReader();
    reader.addEventListener('load', (event) => {

      try {
      this.products = event.target.result;
      this.products = dataForge.fromCSV(this.products);
      this.productsGrouped = this.products.groupBy(row => row.variantname).select(group => ({ 
        product: group.first().variantname}));
      this.productsGrouped = this.productsGrouped.toArray();
      this.dataSourceProduct = new MatTableDataSource<ProductElement>(this.productsGrouped);
      /*this.productsGroupedMuni = this.products.groupBy(row => row.deliverypostcode);
        this.productsGroupedMuni = this.productsGroupedMuni.toArray();
        console.log("products", this.productsGroupedMuni);*/
      this.masterToggleProducts();
      this.loading = false;

    } catch (error) {
      this.message = "File cannot be read. Please valitade file or file format."
    }
    });
    reader.readAsText(this.file);

  }

  productsGroupedMuni;
  //Remove Products from list
  removeProducts(){    
    /*this.selectionProduct.selected.forEach(element => {
      this.products = this.products.where(row => (row["variantname"] == element["product"]))  
    });
    console.log("pro", this.products.toArray());*/
    
  }

  //Read file containing the days until a product expiers
  handleHelpExpiaryInput(e:any) {
    console.log("products", this.productsGroupedMuni);

    this.file = e.target.files[0];
    this.loading = true;
    const reader = new FileReader();
    reader.addEventListener('load', (event) => {
      this.helpExipiary = event.target.result;
      this.helpExipiary = dataForge.fromCSV(this.helpExipiary);
      this.helpExipiary = this.helpExipiary.toArray();
      this.dataSourceDurability = new MatTableDataSource<DurabilityElement>(this.helpExipiary);
      console.log("help", this.helpExipiary);
      this.loading = false;
    });
    reader.readAsText(this.file);
  }

  // UI Stepper
goBack(stepper: MatStepper){
    stepper.previous();
    this.stepIndex = stepper.selectedIndex;
    console.log(this.stepIndex);
}

goForward(stepper: MatStepper){
    stepper.next();
    this.stepIndex = stepper.selectedIndex;
    console.log(this.stepIndex);
}

  /** Whether the number of selected elements matches the total number of rows. */
  isAllSelected() {
    const numSelected = this.selection.selected.length;
    const numRows = this.dataSource.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggle() {
    this.isAllSelected() ?
        this.selection.clear() :
        this.dataSource.data.forEach(row => this.selection.select(row));
  }

  /** The label for the checkbox on the passed row */
  checkboxLabel(row?: CaseElement): string {
    if (!row) {
      return `${this.isAllSelected() ? 'select' : 'deselect'} all`;
    }
    return `${this.selection.isSelected(row) ? 'deselect' : 'select'} row ${row.zip + 1}`;
  }

  isAllSelectedProducts() {
    const numSelected = this.selectionProduct.selected.length;
    const numRows = this.dataSourceProduct.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggleProducts() {
    this.isAllSelectedProducts() ?
        this.selectionProduct.clear() :
        this.dataSourceProduct.data.forEach(row => this.selectionProduct.select(row));
  }

  checkboxLabelProducts(row?: ProductElement): string {
    if (!row) {
      return `${this.isAllSelectedProducts() ? 'select' : 'deselect'} all`;
    }
    return `${this.selectionProduct.isSelected(row) ? 'deselect' : 'select'} row ${row.product + 1}`;
  }
  
  checkboxLabelDurability(row?: DurabilityElement): string {
    if (!row) {
      return `${this.isAllSelectedProducts() ? 'select' : 'deselect'} all`;
    }
    return `${this.selectionDurability.isSelected(row) ? 'deselect' : 'select'} row ${row.productnumber + 1}`;
  }

  isAllSelectedDurability() {
    const numSelected = this.selectionDurability.selected.length;
    const numRows = this.dataSourceDurability.data.length;
    return numSelected === numRows;
  }

  /** Selects all rows if they are not all selected; otherwise clear selection. */
  masterToggleDurability() {
    this.isAllSelected() ?
        this.selectionDurability.clear() :
        this.dataSourceDurability.data.forEach(row => this.selectionDurability.select(row));
  }

  toggleLoading() {
    this.message = "Calculating model. Please wait."
    this.loading = true;
      setTimeout(() => {
        this.runWasi();
      });
  }

  //Saving result

  saveAsJSON() {
    const jsonfile = 
    new Blob([
             JSON.stringify(this.calculationResult)], 
             {type: "text/plain;charset=utf-8"});
             console.log("file", jsonfile);
             
      saveAs(jsonfile, "result.json");
  }

  //Preprocessing data

  wasmFilePath:any;
  echoStr:any;
  wasmFs:any;
  wasi: any;

  runWasi2(x) {
    if (typeof Worker !== 'undefined') {
      // Create a new

      console.log("Worker GO");
      
      const worker = new Worker(new URL('./app.worker', import.meta.url));
      worker.onmessage = ({ data }) => {

                this.calculationResult = JSON.parse(JSON.parse(data));
                
                let res = this.calculationResult;
                let resParsed = [];
                res.forEach(element => {
                  resParsed.push({productnumber:element["productnumber"], variant: element["variant"], name: element["name"]});
                });
                this.dataSourceResult = new MatTableDataSource<ResultElement>(this.calculationResult);
                this.loading = false;
      };
      worker.postMessage(x);
    } else {
      // Web workers are not supported in this environment.
      console.log("NO worker");
      
    }
  }

  preprocessRes;
  runWasi() {
    // Parse files to Array
    console.log("cases", this.cases);
    
    this.helpExipiary = this.dataSourceDurability.filteredData;
    this.cases = this.dataSource.data;
    this.products = this.products.toArray();

    const worker = new Worker(new URL('./preprocess.worker', import.meta.url));
    worker.onmessage = ({ data }) => {
      this.preprocessRes = data;
      console.log("Preprocessing Worker output", this.preprocessRes);
      let wasiInput = {casesaggregated: this.preprocessRes["casesaggregated"], 
                       products: this.preprocessRes["products"],
                       helpExipiary: this.helpExipiary,
                       populationdensity: this.preprocessRes["populationdensity"],
                       incubationmax: this.incubationmax,
                       incubationmin: this.incubationmin
                      }


      this.runWasi2(wasiInput);
      
    }
    let preprocess = {cases: this.cases, products: this.products, postalcodes: this.postalcodes, population: this.population, country: this.country, distancematrixmode: this.distancematrixmode, geojson: this.geojson};
    worker.postMessage(preprocess);

    /*console.log("Arguments", casesaggregated, this.products, this.helpExipiary, populationdensity, this.incubationmax, this.incubationmin)
    let x = { casesaggregated: casesaggregated, 
              products: this.products,
              helpExipiary: this.helpExipiary,
              populationdensity: populationdensity,
              incubationmax: this.incubationmax,
              incubationmin: this.incubationmin};*/
              //this.runWasi2(x);
              
}



  
}
